import { expect } from "chai";
import { ethers } from "hardhat";
import type { StakingVault, ReentrancyAttacker } from "../typechain-types";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("StakingVault", () => {
  let vault: StakingVault;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  beforeEach(async () => {
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
      await expect(
        vault.connect(alice).deposit({ value: 0 })
      ).to.be.revertedWithCustomError(vault, "ZeroDeposit");
    });

    it("emits a Deposited event with the correct arguments", async () => {
      await expect(
        vault.connect(alice).deposit({ value: ethers.parseEther("1") })
      )
        .to.emit(vault, "Deposited")
        .withArgs(alice.address, ethers.parseEther("1"), ethers.parseEther("1"));
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

      expect(await vault.balanceOf(alice.address)).to.equal(0);
    });

    it("reverts when withdrawing more than the caller's balance", async () => {
      await expect(
        vault.connect(alice).withdraw(ethers.parseEther("10"))
      )
        .to.be.revertedWithCustomError(vault, "InsufficientBalance")
        .withArgs(ethers.parseEther("10"), ethers.parseEther("5"));
    });

    it("does not let one account withdraw another account's deposit", async () => {
      await expect(
        vault.connect(bob).withdraw(ethers.parseEther("1"))
      )
        .to.be.revertedWithCustomError(vault, "InsufficientBalance")
        .withArgs(ethers.parseEther("1"), 0);
    });

    it("emits a Withdrawn event with the correct arguments", async () => {
      await expect(vault.connect(alice).withdraw(ethers.parseEther("2")))
        .to.emit(vault, "Withdrawn")
        .withArgs(alice.address, ethers.parseEther("2"), ethers.parseEther("3"));
    });

    it("updates totalDeposits on withdrawal", async () => {
      await vault.connect(alice).withdraw(ethers.parseEther("2"));

      expect(await vault.totalDeposits()).to.equal(ethers.parseEther("3"));
    });
  });

  describe("pausability", () => {
    it("lets the owner pause deposits", async () => {
      await vault.connect(owner).pause();

      await expect(
        vault.connect(alice).deposit({ value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(vault, "ContractPaused");
    });

    it("reverts if a non-owner tries to pause", async () => {
      await expect(
        vault.connect(alice).pause()
      ).to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("still allows withdrawals while paused", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
      await vault.connect(owner).pause();

      await expect(vault.connect(alice).withdraw(ethers.parseEther("1"))).to
        .not.be.reverted;
    });

    it("allows the owner to unpause", async () => {
      await vault.connect(owner).pause();
      await vault.connect(owner).unpause();

      await expect(
        vault.connect(alice).deposit({ value: ethers.parseEther("1") })
      ).to.not.be.reverted;
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

      await expect(
        attacker.attack({ value: attackAmount })
      ).to.be.revertedWithCustomError(vault, "TransferFailed");

      const vaultBalance = await ethers.provider.getBalance(
        await vault.getAddress()
      );

      expect(vaultBalance).to.equal(ethers.parseEther("10"));
      expect(await vault.balanceOf(bob.address)).to.equal(
        ethers.parseEther("10")
      );
      expect(await vault.balanceOf(await attacker.getAddress())).to.equal(0);
    });
  });

  describe("views", () => {
    it("vaultBalance reflects the contract's actual ETH balance", async () => {
      await vault.connect(alice).deposit({ value: ethers.parseEther("3") });

      expect(await vault.vaultBalance()).to.equal(ethers.parseEther("3"));
    });
  });
});
