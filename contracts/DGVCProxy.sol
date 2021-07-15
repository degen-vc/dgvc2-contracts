// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
import '@openzeppelin/contracts/proxy/Proxy.sol';

contract DGVCProxy is Proxy {
    uint[100000] private move;
    address public implementation;
    address public proxyOwner;

    event ImplementationUpdated(address implementation);
    event OwnerUpdated(address proxyOwner);

    modifier onlyProxyOwner() {
        require(proxyOwner == msg.sender, 'Proxy: caller is not the proxy owner');
        _;
    }

    constructor() {
        proxyOwner = msg.sender;
    }

    function updateProxyOwner(address _newOwner) external onlyProxyOwner returns (bool) {
        proxyOwner = _newOwner;
        emit OwnerUpdated(_newOwner);
        return true;
    }

    function setImplementation(address _address) external onlyProxyOwner returns (bool) {
        implementation = _address;
        emit ImplementationUpdated(_address);
        return true;
    }

    function _implementation() internal view override returns (address) {
        return implementation;
    }
}
