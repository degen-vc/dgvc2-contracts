// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Context.sol';
import '@openzeppelin/contracts/access/Ownable.sol';


contract Swap is Context, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public dgvcOne;
    IERC20 public dgvcTwo;
    address public constant deadAddress = 0x000000000000000000000000000000000000dEaD;

    constructor(IERC20 _dgvcOne, IERC20 _dgvcTwo) public {
        dgvcOne = _dgvcOne;
        dgvcTwo = _dgvcTwo;
    }


    function swap() external returns (bool) {
        uint balance = dgvcTwo.balanceOf(address(this));
        require(balance > 0, 'Nothing to swap');
        require(dgvcTwo.balanceOf(address(this)) >= balance, 'Not enough DGVC2 on swap contract');

        dgvcOne.safeTransferFrom(_msgSender(), deadAddress, balance);

        dgvcTwo.safeTransfer(_msgSender(), balance);
        return true;
    }

    function unlockTokens(IERC20 token, address to) onlyOwner external returns (bool) {
        uint balance = token.balanceOf(address(this));
        token.safeTransfer(to, balance);
        return true;
    }
}