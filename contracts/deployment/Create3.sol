// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { IDeployment } from './IDeployment.sol';
import { ContractAddress } from '../libs/ContractAddress.sol';
import { CreateDeploy } from './CreateDeploy.sol';
import { Create3Address } from './Create3Address.sol';

/**
 * @title Create3 contract
 * @notice This contract can be used to deploy a contract with a deterministic address that depends only on
 * the deployer address and deployment salt, not the contract bytecode and constructor parameters
 */
contract Create3 is IDeployment {
 using ContractAddress for address;

  /// @dev bytecode hash of the CreateDeploy helper contract
  bytes32 internal immutable createDeployBytecodeHash;

  constructor() {
    createDeployBytecodeHash = keccak256(type(CreateDeploy).creationCode);
  }

  /**
   * @notice Compute the deployed address that will result from the `CREATE3` method
   * @param salt A salt to influence the contract address
   * @return deployed The deterministic contract address if it was deployed
   */
  function _create3Address(bytes32 salt) internal view returns (address deployed) {
    address deployer = address(
      uint160(uint256(keccak256(abi.encodePacked(hex'ff', address(this), salt, createDeployBytecodeHash))))
    );
    deployed = address(uint160(uint256(keccak256(abi.encodePacked(hex'd6_94', deployer, hex'01')))));
  }

 /**
  * @notice Deploys a new contract using the `CREATE3` method
  * @dev This function first deploys the CreateDeploy contract using
  * the `CREATE2` opcode and then utilizes the CreateDeploy to deploy the
  * new contract with the `CREATE` opcode
  * @param bytecode The bytecode of the contract to be deployed
  * @param salt Deterministic salt to influence the contract address
  * @return deployed The address of the deployed contract
  */
 function _create3(bytes memory bytecode, bytes32 salt) internal returns (address deployed) {
  deployed = _create3Address(salt);

  if (bytecode.length == 0) revert EmptyBytecode();
  if (deployed.isContract()) revert AlreadyDeployed();

  // Deploy using create2
  CreateDeploy create = new CreateDeploy{ salt: salt }();

  if (address(create) == address(0)) revert DeployFailed();

  // Deploy using create
  create.deploy(bytecode);
 }
}
