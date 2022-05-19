const { expectEvent, expectRevert, time } = require("@openzeppelin/test-helpers");
const { assert, expect } = require("chai");
const BigNumber = require("bignumber.js");
const MockERC20 = artifacts.require("MockERC20");
BigNumber.config({ ROUNDING_MODE: BigNumber.ROUND_FLOOR, DECIMAL_PLACES: 0 });

const SmartCraftInitializable = artifacts.require("SmartCraftInitializable");

contract("SmartCraftInitializable", ([alice, bob, carol, deployer, contractOwner]) => {
  const numberOfBlockInBonusPeriod = 50;
  let contract;
  let mockStakeToken;
  let mockRewardToken;
  let mockWrongToken;
  const mockRewardPerBlock = "77777777780000";
  let mockStartBlock;
  let mockBonusBlock;
  const mockPoolLimitPerUser = "2000000000000000000000000000";
  const mockTotalRewardToken = "71000000000000000000";
  const expectedPrecisionFactor = new BigNumber(10 ** (36 - 18));

  beforeEach(async () => {
    if (!mockStartBlock) {
      const currentBlock = new BigNumber(await time.latestBlock()).toNumber();
      mockStartBlock = currentBlock;
      mockBonusBlock = mockStartBlock + numberOfBlockInBonusPeriod;
    }
    contract = await SmartCraftInitializable.new({ from: deployer });
    mockStakeToken = await MockERC20.new("VVS Token", "VVS", "100000000000000000000000000000000", {
      from: deployer,
    });
    mockRewardToken = await MockERC20.new("Reward Token", "REWARD", "1000000000000000000000000", {
      from: deployer,
    });
    mockWrongToken = await MockERC20.new("Wrong Token", "WRONG", "4000000", {
      from: deployer,
    });
    await mockRewardToken.transfer(contract.address, mockTotalRewardToken, { from: deployer });
  });

  describe("initialize", async () => {
    it("should initialize correctly", async () => {
      const transaction = await contract.initialize(
        mockStakeToken.address,
        mockRewardToken.address,
        mockRewardPerBlock,
        mockStartBlock,
        mockBonusBlock,
        mockPoolLimitPerUser,
        contractOwner,
        { from: deployer },
      );
      expect(await contract.isInitialized()).to.be.true;
      expect(new BigNumber(await contract.PRECISION_FACTOR())).to.deep.eq(expectedPrecisionFactor);
      expect(new BigNumber(await contract.lastRewardBlock())).to.deep.eq(new BigNumber(mockStartBlock));
      expect(await contract.owner()).to.be.eq(contractOwner);
      expectEvent(transaction, "OwnershipTransferred", [deployer, contractOwner]);
    });

    it("should not allow initialize again", async () => {
      await contract.initialize(
        mockStakeToken.address,
        mockRewardToken.address,
        mockRewardPerBlock,
        mockStartBlock,
        mockBonusBlock,
        mockPoolLimitPerUser,
        contractOwner,
        { from: deployer },
      );
      expect(await contract.isInitialized()).to.be.true;
      await expectRevert(
        contract.initialize(
          mockStakeToken.address,
          mockRewardToken.address,
          mockRewardPerBlock,
          mockStartBlock,
          mockBonusBlock,
          mockPoolLimitPerUser,
          contractOwner,
          { from: deployer },
        ),
        "Already initialized",
      );
    });

    it("should not allow non SMART_CRAFT_FACTORY to initialize pool", async () => {
      await expectRevert(
        contract.initialize(
          mockStakeToken.address,
          mockRewardToken.address,
          mockRewardPerBlock,
          mockStartBlock,
          mockBonusBlock,
          mockPoolLimitPerUser,
          contractOwner,
          { from: contractOwner },
        ),
        "Not factory",
      );
    });
  });

  describe("functions", async () => {
    beforeEach(async () => {
      await contract.initialize(
        mockStakeToken.address,
        mockRewardToken.address,
        mockRewardPerBlock,
        mockStartBlock,
        mockBonusBlock,
        mockPoolLimitPerUser,
        contractOwner,
        { from: deployer },
      );
    });

    describe("deposit", async () => {
      it("should deposit correctly", async () => {
        const mockAmount = 4;
        await mockStakeToken.approve(contract.address, mockAmount, { from: deployer });
        const transaction = await contract.deposit(mockAmount, { from: deployer });
        expectEvent(transaction, "Deposit", [deployer, `${mockAmount}`]);
        assert.equal(await contract.accTokenPerShare(), 0);
      });
    });

    describe("withdraw", async () => {
      it("should throw when deposit amount above poolLimitPerUser", async () => {
        await expectRevert(contract.deposit(mockPoolLimitPerUser + 1, { from: deployer }), "User amount above limit");
      });

      it("should withdraw correctly", async () => {
        const mockAmount = 4;
        // prepare for withdraw
        await mockStakeToken.approve(contract.address, mockAmount, { from: deployer });
        await contract.deposit(mockAmount, { from: deployer });
        assert.equal(await mockStakeToken.balanceOf(contract.address), mockAmount);
        const lastRewardBlock = await contract.lastRewardBlock();
        // test withdraw
        const transaction = await contract.withdraw(mockAmount, { from: deployer });
        expectEvent(transaction, "Withdraw", [deployer, `${mockAmount}`]);
        assert.equal(await mockStakeToken.balanceOf(contract.address), 0);
        const multiplier = new BigNumber(await time.latestBlock()).minus(lastRewardBlock); // blockDiff
        const vvsReward = multiplier.multipliedBy(mockRewardPerBlock);
        assert.equal(
          (await contract.accTokenPerShare()).toString(10),
          vvsReward
            .multipliedBy(expectedPrecisionFactor)
            .dividedBy(mockAmount)
            .toString(10),
        );
      });
    });

    describe("emergencyWithdraw", async () => {
      it("should emergencyWithdraw correctly", async () => {
        const mockAmount = 4;
        // prepare for withdraw
        await mockStakeToken.approve(contract.address, mockAmount, { from: deployer });
        await contract.deposit(mockAmount, { from: deployer });
        assert.equal(await mockStakeToken.balanceOf(contract.address), mockAmount);
        // test withdraw
        const transaction = await contract.emergencyWithdraw({ from: deployer });
        assert.equal(await contract.accTokenPerShare(), 0);
        expectEvent(transaction, "EmergencyWithdraw", [deployer, `${mockAmount}`]);
      });
    });

    describe("emergencyRewardWithdraw", async () => {
      const mockAmount = 4;

      it("should throw when not called by owner", async () => {
        await expectRevert(
          contract.emergencyRewardWithdraw(mockAmount, { from: alice }),
          "Ownable: caller is not the owner",
        );
      });

      it("should emergencyRewardWithdraw correctly", async () => {
        assert.equal(await mockRewardToken.balanceOf(contract.address), mockTotalRewardToken);
        // test withdraw
        const transaction = await contract.emergencyRewardWithdraw(mockAmount, { from: contractOwner });
        assert.equal(
          await mockRewardToken.balanceOf(contract.address),
          new BigNumber(mockTotalRewardToken).minus(mockAmount).toString(10),
        );
        expectEvent(transaction, "EmergencyRewardWithdraw", [contractOwner, `${mockAmount}`]);
      });
    });

    describe("recoverWrongTokens", async () => {
      it("should throw when not called by owner", async () => {
        await expectRevert(
          contract.recoverWrongTokens(mockWrongToken.address, 10, { from: alice }),
          "Ownable: caller is not the owner",
        );
      });

      it("should throw when balance of wrongToken in contract is less than input", async () => {
        await expectRevert(
          contract.recoverWrongTokens(mockWrongToken.address, 10, { from: contractOwner }),
          "ERC20: transfer amount exceeds balance",
        );
      });

      it("should emit event AdminTokenRecovery and send wrongToken to sender when balance of wrongToken in contract = input", async () => {
        const mockWrongTokenBalance = 999;
        await mockWrongToken.transfer(contract.address, mockWrongTokenBalance, { from: deployer });
        assert.equal(await mockWrongToken.balanceOf(contract.address), mockWrongTokenBalance);
        const transaction = await contract.recoverWrongTokens(mockWrongToken.address, mockWrongTokenBalance, {
          from: contractOwner,
        });
        expectEvent(transaction, "AdminTokenRecovery", [mockWrongToken.address, `${mockWrongTokenBalance}`]);
        assert.equal(await mockWrongToken.balanceOf(contract.address), 0);
      });

      // eslint-disable-next-line max-len
      it("should emit event AdminTokenRecovery and send input amount of wrongToken to sender when balance of wrongToken in contract > input", async () => {
        const mockWrongTokenBalance = 999;
        const mockRemainingAmount = 9;
        await mockWrongToken.transfer(contract.address, mockWrongTokenBalance, { from: deployer });
        assert.equal(await mockWrongToken.balanceOf(contract.address), mockWrongTokenBalance);
        const transaction = await contract.recoverWrongTokens(
          mockWrongToken.address,
          mockWrongTokenBalance - mockRemainingAmount,
          { from: contractOwner },
        );
        expectEvent(transaction, "AdminTokenRecovery", [
          mockWrongToken.address,
          `${mockWrongTokenBalance - mockRemainingAmount}`,
        ]);
        assert.equal(await mockWrongToken.balanceOf(contract.address), mockRemainingAmount);
      });
    });

    describe("stopReward", async () => {
      it("should throw when not called by owner", async () => {
        await expectRevert(contract.stopReward({ from: alice }), "Ownable: caller is not the owner");
      });

      it("should update bonusEndBlock = current block number", async () => {
        await contract.stopReward({ from: contractOwner });
        const currentBlock = new BigNumber(await time.latestBlock()).toNumber();
        assert.equal(await contract.bonusEndBlock(), currentBlock.toString());
      });
    });

    describe("updatePoolLimitPerUser", async () => {
      const newPoolLimitPerUser = new BigNumber(mockPoolLimitPerUser).plus(1).toString(10);

      describe("when contract initialize with 0 poolLimitPerUser", async () => {
        beforeEach(async () => {
          // init contract without poolLimitPerUser
          await newContract({ poolLimitPerUser: 0 });
        });

        for (const newHasUserLimit of [true, false]) {
          it(`should throw when input newHasUserLimit = ${newHasUserLimit}`, async () => {
            await expectRevert(
              contract.updatePoolLimitPerUser(newHasUserLimit, newPoolLimitPerUser, {
                from: contractOwner,
              }),
              "Must be set",
            );
          });
        }
      });

      describe("input _hasUserLimit = false", async () => {
        const newHasUserLimit = false;

        it("should update poolLimitPerUser = 0 instead of newPoolLimitPerUser and not allow turn on again", async () => {
          const transaction = await contract.updatePoolLimitPerUser(newHasUserLimit, newPoolLimitPerUser, {
            from: contractOwner,
          });
          expectEvent(transaction, "NewPoolLimit", [`${0}`]);
          assert.equal(await contract.poolLimitPerUser(), 0);
          // turn on user limit again
          await expectRevert(
            contract.updatePoolLimitPerUser(true, newPoolLimitPerUser, {
              from: contractOwner,
            }),
            "Must be set",
          );
        });
      });

      describe("input _hasUserLimit = true", async () => {
        const newHasUserLimit = true;

        it("should throw when not called by owner", async () => {
          await expectRevert(
            contract.updatePoolLimitPerUser(newHasUserLimit, newPoolLimitPerUser, { from: alice }),
            "Ownable: caller is not the owner",
          );
        });

        it("should throw when poolLimitPerUser > newPoolLimit", async () => {
          const newPoolLimitPerUser = new BigNumber(mockPoolLimitPerUser).minus(1).toString(10);

          await expectRevert(
            contract.updatePoolLimitPerUser(newHasUserLimit, newPoolLimitPerUser, { from: contractOwner }),
            "New limit must be higher",
          );
        });

        it("should throw when poolLimitPerUser = newPoolLimit", async () => {
          await expectRevert(
            contract.updatePoolLimitPerUser(newHasUserLimit, mockPoolLimitPerUser, { from: contractOwner }),
            "New limit must be higher",
          );
        });

        it("should update poolLimitPerUser < newPoolLimit", async () => {
          const transaction = await contract.updatePoolLimitPerUser(newHasUserLimit, `${newPoolLimitPerUser}`, {
            from: contractOwner,
          });
          expectEvent(transaction, "NewPoolLimit", [`${newPoolLimitPerUser}`]);
          assert.equal((await contract.poolLimitPerUser()).toString(10), newPoolLimitPerUser);
        });
      });
    });

    describe("updateRewardPerBlock", async () => {
      const newRewardPerBlock = 456;

      it("should throw when not called by owner", async () => {
        await expectRevert(
          contract.updateRewardPerBlock(newRewardPerBlock, { from: alice }),
          "Ownable: caller is not the owner",
        );
      });

      it("should update rewardPerBlock = newRewardPerBlock", async () => {
        await expectRevert(
          contract.updateRewardPerBlock(newRewardPerBlock, { from: contractOwner }),
          "Pool has started",
        );
      });

      it("should throw when startBlock > block.number", async () => {
        const currentBlock = new BigNumber(await time.latestBlock()).toNumber();
        const startBlock = currentBlock + 10;
        const bonusBlock = startBlock + numberOfBlockInBonusPeriod;
        const contractNotYetStart = await SmartCraftInitializable.new({ from: deployer });
        await contractNotYetStart.initialize(
          mockStakeToken.address,
          mockRewardToken.address,
          mockRewardPerBlock,
          startBlock,
          bonusBlock,
          0,
          contractOwner,
          { from: deployer },
        );
        const transaction = await contractNotYetStart.updateRewardPerBlock(newRewardPerBlock, { from: contractOwner });
        expectEvent(transaction, "NewRewardPerBlock", [`${newRewardPerBlock}`]);
      });
    });

    describe("pendingReward", async () => {
      const stakedAmountByUser = {
        [bob]: "100000",
        [alice]: "811502365585479382873389038",
        [carol]: "10",
      };
      let totalStakeTokenInContract = new BigNumber(0);

      beforeEach(async () => {
        await advanceBlockHeightToCleanEnviornment(mockBonusBlock);
        await newContract({});
        for (const user of Object.keys(stakedAmountByUser)) {
          const stakedAmount = stakedAmountByUser[user];
          assert.equal(await contract.pendingReward(user), 0);
          // console.log(`mockStakeToken.balanceOf(deployer.address) ${await mockStakeToken.balanceOf(user.address)}`);
          await mockStakeToken.transfer(user, `${stakedAmount}`, { from: deployer });
          await mockStakeToken.approve(contract.address, `${stakedAmount}`, { from: user });
          await contract.deposit(`${stakedAmount}`, { from: user });
          totalStakeTokenInContract = totalStakeTokenInContract.plus(stakedAmount);
          assert.equal(
            (await mockStakeToken.balanceOf(contract.address)).toString(),
            totalStakeTokenInContract.toString(10),
          );
          assert.equal(await contract.pendingReward(user), 0);
        }
      });

      afterEach(async () => {
        totalStakeTokenInContract = new BigNumber(0);
      });

      it("should return pendingReward of given user when +/=/- bonusEndBlock", async () => {
        const endBlock = await contract.bonusEndBlock();
        // at bonusEndBlock - 1 block
        await time.advanceBlockTo(mockBonusBlock - 1);
        await pendingRewardTestCase(await time.latestBlock());
        // at bonusEndBlock
        await time.advanceBlock(1);
        await pendingRewardTestCase(endBlock);
        // at bonusEndBlock + 1 block
        await time.advanceBlock(1);
        await pendingRewardTestCase(endBlock);
      });

      async function pendingRewardTestCase (endBlock) {
        const multiplier = endBlock - (await contract.lastRewardBlock()); // blockDiff
        const vvsReward = new BigNumber(mockRewardPerBlock * multiplier);
        const accTokenPerShare = new BigNumber(await contract.accTokenPerShare());
        const adjustedTokenPerShare = accTokenPerShare.plus(
          vvsReward.multipliedBy(expectedPrecisionFactor).dividedBy(totalStakeTokenInContract),
        );
        for (const user of Object.keys(stakedAmountByUser)) {
          const stakedAmount = stakedAmountByUser[user];
          const userInfo = await contract.userInfo(user);
          assert.equal(userInfo.amount, stakedAmount);
          assert.equal(
            (await contract.pendingReward(user)).toString(10),
            adjustedTokenPerShare
              .multipliedBy(stakedAmount)
              .dividedBy(expectedPrecisionFactor)
              .minus(userInfo.rewardDebt)
              .toString(10),
          );
        }
      }
    });

    describe("updateStartAndEndBlocks", async () => {
      let newStartBlock;
      let newBonusEndBlock;

      beforeEach(async () => {
        await advanceBlockHeightToCleanEnviornment(mockBonusBlock);
        await newContract({ startBlock: mockStartBlock + 10, bonusBlock: mockBonusBlock + 10 });
        newStartBlock = mockStartBlock + 20;
        newBonusEndBlock = mockBonusBlock + 20;
      });

      it("should throw when not called by owner", async () => {
        await expectRevert(
          contract.updateStartAndEndBlocks(newStartBlock, newBonusEndBlock, { from: alice }),
          "Ownable: caller is not the owner",
        );
      });

      it("should update rewardPerBlock = newStartBlock, bonusEndBlock = newBonusEndBlock, lastRewardBlock = newStartBlock", async () => {
        const transaction = await contract.updateStartAndEndBlocks(newStartBlock, newBonusEndBlock, {
          from: contractOwner,
        });
        expectEvent(transaction, "NewStartAndEndBlocks", [`${newStartBlock}`, `${newBonusEndBlock}`]);
        assert.equal(await contract.lastRewardBlock(), newStartBlock);
      });

      it("should throw when newStartBlock > newBonusEndBlock", async () => {
        await expectRevert(
          contract.updateStartAndEndBlocks(newBonusEndBlock, newStartBlock, { from: contractOwner }),
          "New startBlock must be lower than new endBlock",
        );
      });

      it("should throw when startBlock > block.number", async () => {
        await time.advanceBlockTo((await contract.startBlock()) + 1);
        await expectRevert(
          contract.updateStartAndEndBlocks(newStartBlock, newBonusEndBlock, { from: contractOwner }),
          "Pool has started",
        );
      });
    });
  });
  async function advanceBlockHeightToCleanEnviornment (targetBlockHeight) {
    const currentBlock = new BigNumber(await time.latestBlock());
    if (currentBlock.isGreaterThan(targetBlockHeight)) {
      targetBlockHeight = currentBlock.toNumber();
    }
    await time.advanceBlockTo(targetBlockHeight);
    mockStartBlock = targetBlockHeight;
    mockBonusBlock = targetBlockHeight + numberOfBlockInBonusPeriod;
  }

  async function newContract (param) {
    const { startBlock, bonusBlock, poolLimitPerUser } = param;
    contract = await SmartCraftInitializable.new({ from: deployer });
    await contract.initialize(
      mockStakeToken.address,
      mockRewardToken.address,
      mockRewardPerBlock,
      startBlock || mockStartBlock,
      bonusBlock || mockBonusBlock,
      new BigNumber(poolLimitPerUser).isInteger() ? poolLimitPerUser : mockPoolLimitPerUser,
      contractOwner,
      { from: deployer },
    );
    await mockRewardToken.transfer(contract.address, mockTotalRewardToken, { from: deployer });
  }
});
