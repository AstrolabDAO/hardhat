// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

/**
 * @title IDeploy Interface
 * @notice This interface defines the errors for a contract that is responsible for deploying new contracts.
 */
interface IDeployment {
  error EmptyBytecode();
  error AlreadyDeployed();
  error DeployFailed();
}
