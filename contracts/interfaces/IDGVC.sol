pragma solidity 0.8.4;
import "./IERC20.sol";

interface IDGVC is IERC20 {
    function burn(uint amount) external returns (bool);
}