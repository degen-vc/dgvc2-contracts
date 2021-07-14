pragma solidity 0.8.4;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDGVC is IERC20 {
    function burn(uint amount) external returns (bool);
}