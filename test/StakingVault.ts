import { expect } from "chai";
import { network } from "hardhat";
import type { StakingVault, ReentrancyAttacker } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";


async function expectRevert(
  promise: Promise<unknown>,
  errorName: string
) {
  let reverted = false;

  try {
    await promise;
  } catch (error: any) {
    reverted = true;

    const message = String(error?.message ?? error);
    if (!message.includes(errorName)) {
      throw error;
    }
  }

  if (!reverted) {
    throw new Error(`Expected transaction to revert with ${errorName}`);
  }
}

describe("StakingVault", () => {
  let ethers: Awaited<ReturnType<typeof network.connect>>["ethers"];

  let vault: StakingVault;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  beforeEach(async () => {
    ({ ethers } = await network.connect());
    [owner, alice, bob] = await ethers.getSigners();

    const VaultFactory = await ethers.getContractFactory("StakingVault");
    vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
  });

  describe("deposits", () => {
    it("records the deposited amount against the sender's balance", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });

      expect(await vault.balanceOf(alice.address)).to.equal(
        ethers.parseEther("1")
      );
    });

    it("accumulates multiple deposits from the same address", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
      await vault.connect(alice).deposit({ value: ethers.parseEther("2") });

      expect(await vault.balanceOf(alice.address)).to.equal(
        ethers.parseEther("3")
      );
    });

    it("keeps balances isolated per depositor", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
      await vault.connect(bob).deposit({ value: ethers.parseEther("5") });

      expect(await vault.balanceOf(alice.address)).to.equal(
        ethers.parseEther("1")
      );
      expect(await vault.balanceOf(bob.address)).to.equal(
        ethers.parseEther("5")
      );
    });

    it("reverts on a zero-value deposit", async () => {
      await expectRevert(
        vault.connect(alice).deposit({ value: 0 }),
        "ZeroDeposit"
      );
    });

    it("emits a Deposited event with the correct arguments", async () => {
      const tx = await vault
        .connect(alice)
        .deposit({ value: ethers.parseEther("1") });

      const receipt = await tx.wait();

      expect(receipt?.logs.length).to.be.greaterThan(0);

      const parsedLogs = receipt!.logs
        .map((log) => {
          try {
            return vault.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((log) => log !== null);

      const event = parsedLogs.find((log) => log!.name === "Deposited");

      expect(event).to.not.equal(null);
      expect(event!.args[0]).to.equal(alice.address);
      expect(event!.args[1]).to.equal(ethers.parseEther("1"));
      expect(event!.args[2]).to.equal(ethers.parseEther("1"));
    });

    it("updates totalDeposits across multiple depositors", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
      await vault.connect(bob).deposit({ value: ethers.parseEther("2") });

      expect(await vault.totalDeposits()).to.equal(ethers.parseEther("3"));
    });

    it("accepts plain ETH transfers via receive()", async () => {
      await alice.sendTransaction({
        to: await vault.getAddress(),
        value: ethers.parseEther("1")
      });

      expect(await vault.balanceOf(alice.address)).to.equal(
        ethers.parseEther("1")
      );
    });
  });

  describe("withdrawals", () => {
    beforeEach(async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("5") });
    });

    it("allows withdrawing part of a balance", async () => {
      await vault.connect(alice).withdraw(ethers.parseEther("2"));

      expect(await vault.balanceOf(alice.address)).to.equal(
        ethers.parseEther("3")
      );
    });

    it("transfers the correct ETH amount to the withdrawer", async () => {
      const balanceBefore = await ethers.provider.getBalance(alice.address);

      const tx = await vault.connect(alice).withdraw(ethers.parseEther("2"));
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(alice.address);

      expect(balanceAfter).to.equal(
        balanceBefore + ethers.parseEther("2") - gasCost
      );
    });

    it("allows withdrawing the full balance with withdrawAll", async () => {
      await vault.connect(alice).withdrawAll();

      expect(await vault.balanceOf(alice.address)).to.equal(0n);
    });

    it("reverts when withdrawing more than the caller's balance", async () => {
      await expectRevert(
        vault.connect(alice).withdraw(ethers.parseEther("10")),
        "InsufficientBalance"
      );
    });

    it("reverts on a zero-value withdrawal", async () => {
      await expectRevert(
        vault.connect(alice).withdraw(0),
        "ZeroWithdrawal"
      );
    });

    it("does not let one account withdraw another account's deposit", async () => {
      await expectRevert(
        vault.connect(bob).withdraw(ethers.parseEther("1")),
        "InsufficientBalance"
      );
    });

    it("emits a Withdrawn event with the correct arguments", async () => {
      const tx = await vault
        .connect(alice)
        .withdraw(ethers.parseEther("2"));

      const receipt = await tx.wait();

      expect(receipt?.logs.length).to.be.greaterThan(0);

      const parsedLogs = receipt!.logs
        .map((log) => {
          try {
            return vault.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter((log) => log !== null);

      const event = parsedLogs.find((log) => log!.name === "Withdrawn");

      expect(event).to.not.equal(null);
      expect(event!.args[0]).to.equal(alice.address);
      expect(event!.args[1]).to.equal(ethers.parseEther("2"));
      expect(event!.args[2]).to.equal(ethers.parseEther("3"));
    });

    it("updates totalDeposits on withdrawal", async () => {
      await vault.connect(alice).withdraw(ethers.parseEther("2"));

      expect(await vault.totalDeposits()).to.equal(ethers.parseEther("3"));
    });
  });

  describe("pausability", () => {
    it("lets the owner pause deposits", async () => {
      await vault.connect(owner).pause();

      await expectRevert(
        vault.connect(alice).deposit({ value: ethers.parseEther("1") }),
        "ContractPaused"
      );
    });

    it("reverts if a non-owner tries to pause", async () => {
      await expectRevert(
        vault.connect(alice).pause(),
        "NotOwner"
      );
    });

    it("still allows withdrawals while paused", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
      await vault.connect(owner).pause();

      await vault.connect(alice).withdraw(ethers.parseEther("1"));
    });

    it("allows the owner to unpause", async () => {
      await vault.connect(owner).pause();
      await vault.connect(owner).unpause();

      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
    });
  });

  describe("reentrancy protection", () => {
    it("blocks the reentrant call and reverts the entire attack transaction", async () => {
      const AttackerFactory = await ethers.getContractFactory(
        "ReentrancyAttacker"
      );
      const attacker: ReentrancyAttacker = await AttackerFactory.deploy(
        await vault.getAddress()
      );
      await attacker.waitForDeployment();

      await vault.connect(bob).deposit({ value: ethers.parseEther("10") });

      const attackAmount = ethers.parseEther("1");

      await expectRevert(
        attacker.attack({ value: attackAmount }),
        "TransferFailed"
      );

      const vaultBalance = await ethers.provider.getBalance(
        await vault.getAddress()
      );

      expect(vaultBalance).to.equal(ethers.parseEther("10"));
      expect(await vault.balanceOf(bob.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await vault.balanceOf(await attacker.getAddress())).to.equal(0n);
    });
  });

  describe("failed transfers", () => {
    it("reverts and preserves accounting when the receiver rejects ETH", async () => {
      const RejectingReceiverFactory =
        await ethers.getContractFactory("RejectingReceiver");

      const rejectingReceiver = await RejectingReceiverFactory.deploy(
        await vault.getAddress()
      );
      await rejectingReceiver.waitForDeployment();

      const amount = ethers.parseEther("2");

      await rejectingReceiver.deposit({ value: amount });

      expect(
        await vault.balanceOf(await rejectingReceiver.getAddress())
      ).to.equal(amount);

      await expectRevert(
        rejectingReceiver.withdraw(amount),
        "TransferFailed"
      );

      expect(
        await vault.balanceOf(await rejectingReceiver.getAddress())
      ).to.equal(amount);

      expect(await vault.totalDeposits()).to.equal(amount);
      expect(await vault.vaultBalance()).to.equal(amount);
    });
  });

  describe("forced ETH", () => {
    it("does not change accounting when ETH is forced into the vault", async () => {
      const ForceSendFactory = await ethers.getContractFactory("ForceSend");

      const forcedAmount = ethers.parseEther("1");
      const forceSend = await ForceSendFactory.deploy({
        value: forcedAmount
      });

      await forceSend.waitForDeployment();

      await forceSend.forceSend(await vault.getAddress());

      expect(await vault.vaultBalance()).to.equal(forcedAmount);
      expect(await vault.totalDeposits()).to.equal(0n);
    });
  });

  describe("views", () => {
    it("vaultBalance reflects the contract's actual ETH balance", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("3") });

      expect(await vault.vaultBalance()).to.equal(ethers.parseEther("3"));
    });
  });
});
