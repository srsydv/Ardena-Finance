// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract AccessController is Initializable, UUPSUpgradeable {
    address public owner; // protocol owner (can be DAO multisig)
    mapping(address => bool) public managers; // allowed to operate vaults
    mapping(address => bool) public keepers; // bots allowed to call keeper funcs

    event OwnerUpdated(address indexed newOwner);
    event ManagerSet(address indexed who, bool allowed);
    event KeeperSet(address indexed who, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }
    modifier onlyManager() {
        require(managers[msg.sender], "NOT_MANAGER");
        _;
    }
    modifier onlyKeeper() {
        require(keepers[msg.sender], "NOT_KEEPER");
        _;
    }

    function initialize(address _owner) public initializer {
        __UUPSUpgradeable_init();
        owner = _owner;
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
        emit OwnerUpdated(_owner);
    }

    function setManager(address who, bool ok) external onlyOwner {
        managers[who] = ok;
        emit ManagerSet(who, ok);
    }

    function setKeeper(address who, bool ok) external onlyOwner {
        keepers[who] = ok;
        emit KeeperSet(who, ok);
    }

    function _authorizeUpgrade(
        address /*newImplementation*/
    ) internal view override {
        require(msg.sender == owner, "NOT_OWNER");
    }

    uint256[50] private __gap;
}
