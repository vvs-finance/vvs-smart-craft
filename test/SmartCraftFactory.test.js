const { assert } = require("chai");
const BigNumber = require("bignumber.js");
const MockERC20 = artifacts.require("MockERC20");
BigNumber.config({ ROUNDING_MODE: BigNumber.ROUND_FLOOR, DECIMAL_PLACES: 0 });

const SmartCraftFactory = artifacts.require("SmartCraftFactory");

contract("SmartCraftFactory", ([deployer, contractOwner]) => {
  let contract;
  let mockStakeToken;
  let mockRewardToken;
  let mockWrongToken;
  const mockRewardPerBlock = 1;
  const mockStartBlock = 2222;
  const mockBonusBlock = 3333;
  const mockPoolLimitPerUser = 200000;
  beforeEach(async () => {
    contract = await SmartCraftFactory.new({ from: deployer });
    mockStakeToken = await MockERC20.new("Stake Token", "STAKE", "2000000", {
      from: deployer,
    });
    mockRewardToken = await MockERC20.new("Reward Token", "REWARD", "3000000", {
      from: deployer,
    });
    mockWrongToken = await MockERC20.new("Wrong Token", "WRONG", "4000000", {
      from: deployer,
    });
  });

  describe("deployPool", async () => {
    it("should deployPool correctly", async () => {
      const transaction = await contract.deployPool(
        mockStakeToken.address,
        mockRewardToken.address,
        mockRewardPerBlock,
        mockStartBlock,
        mockBonusBlock,
        mockPoolLimitPerUser,
        contractOwner,
        { from: deployer },
      );
      assert.equal(await contract.smartCraftsLength(), 1);
      assert.equal(transaction.logs[transaction.logs.length - 1].event, "NewSmartCraftContract");
      const smartCraftAddress = transaction.logs[transaction.logs.length - 1].args.smartCraft;
      assert.equal(smartCraftAddress, await contract.smartCrafts(0));
    });
  });
});
