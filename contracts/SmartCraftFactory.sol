pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SmartCraftInitializable.sol";

contract SmartCraftFactory is Ownable {
  event NewSmartCraftContract(address indexed smartCraft);

  // Address of each pool.
  address[] public smartCrafts;

  constructor() public {
    //
  }

  /*
   * @notice Deploy the pool
   * @param _stakedToken: staked token address
   * @param _rewardToken: reward token address
   * @param _rewardPerBlock: reward per block (in rewardToken)
   * @param _startBlock: start block
   * @param _endBlock: end block
   * @param _poolLimitPerUser: pool limit per user in stakedToken (if any, else 0)
   * @param _admin: admin address with ownership
   * @return address of new smart chef contract
   */
  function deployPool(
    ERC20 _stakedToken,
    ERC20 _rewardToken,
    uint256 _rewardPerBlock,
    uint256 _startBlock,
    uint256 _bonusEndBlock,
    uint256 _poolLimitPerUser,
    address _admin
  ) external onlyOwner {
    require(_stakedToken.totalSupply() >= 0);
    require(_rewardToken.totalSupply() >= 0);
    require(_stakedToken != _rewardToken, "Tokens must be be different");

    bytes memory bytecode = type(SmartCraftInitializable).creationCode;
    bytes32 salt = keccak256(abi.encodePacked(_stakedToken, _rewardToken, _startBlock));
    address smartCraftAddress;

    assembly {
      smartCraftAddress := create2(0, add(bytecode, 32), mload(bytecode), salt)
    }

    SmartCraftInitializable(smartCraftAddress).initialize(
      _stakedToken,
      _rewardToken,
      _rewardPerBlock,
      _startBlock,
      _bonusEndBlock,
      _poolLimitPerUser,
      _admin
    );

    smartCrafts.push(smartCraftAddress);
    emit NewSmartCraftContract(smartCraftAddress);
  }

  function smartCraftsLength() external view returns (uint256) {
    return smartCrafts.length;
  }
}
