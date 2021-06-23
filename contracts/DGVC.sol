pragma solidity 0.8.4;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IDGVC.sol";

contract DGVC is IDGVC, Context, Ownable {
    mapping (address => uint) private _reflectionOwned;
    mapping (address => uint) private _actualOwned;
    mapping (address => mapping (address => uint)) private _allowances;
    mapping (address => uint) public customFOT;
    mapping (address => DexFOT) public dexFOT;

    struct DexFOT {
      uint16 buy;
      uint16 sell;
   }


    mapping (address => bool) private _isExcluded;
    address[] private _excluded;
    address public feeReceiver;
    address public router;

    string  private constant _NAME = "Degen.vc";
    string  private constant _SYMBOL = "DGVC";
    uint8   private constant _DECIMALS = 18;

    uint private constant _MAX = type(uint).max;
    uint private constant _DECIMALFACTOR = 10 ** uint(_DECIMALS);
    uint private constant _DIVIDER = 10000;

    uint private _actualTotal = 100000000 * _DECIMALFACTOR;
    uint private _reflectionTotal = (_MAX - (_MAX % _actualTotal));

    uint private _actualFeeTotal;
    uint private _actualBurnTotal;

    uint private _actualBurnCycle;

    uint private burnFee;
    uint public commonFotFee;

    uint private constant _MAX_TX_SIZE = 100000000 * _DECIMALFACTOR;

    constructor(address _router) public {
        _reflectionOwned[_msgSender()] = _reflectionTotal;
        router = _router;
        emit Transfer(address(0), _msgSender(), _actualTotal);
    }

    function name() public pure returns (string memory) {
        return _NAME;
    }

    function symbol() public pure returns (string memory) {
        return _SYMBOL;
    }

    function decimals() public pure returns (uint8) {
        return _DECIMALS;
    }

    function totalSupply() public view override returns (uint) {
        return _actualTotal;
    }

    function balanceOf(address account) public view override returns (uint) {
        if (_isExcluded[account]) return _actualOwned[account];
        return tokenFromReflection(_reflectionOwned[account]);
    }

    function transfer(address recipient, uint amount) public override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint amount) public override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint amount) public override returns (bool) {
        _transfer(sender, recipient, amount);
        require(_allowances[sender][_msgSender()] >= amount, "ERC20: transfer amount exceeds allowance");
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()] - amount);
        return true;
    }

    function isExcluded(address account) public view returns (bool) {
        return _isExcluded[account];
    }

    function totalFees() public view returns (uint) {
        return _actualFeeTotal;
    }

    function totalBurn() public view returns (uint) {
        return _actualBurnTotal;
    }

    function setFeeReceiver(address receiver) external onlyOwner() returns (bool) {
        require(receiver != address(0), "Zero address not allowed");
        feeReceiver = receiver;
        return true;
    }

    function totalBurnWithFees() public view returns (uint) {
        return _actualBurnTotal + _actualFeeTotal;
    }

    function reflectionFromToken(uint transferAmount, bool deductTransferFee) public view returns(uint) {
        require(transferAmount <= _actualTotal, "Amount must be less than supply");
        if (!deductTransferFee) {
            (uint reflectionAmount,,,,,) = _getValues(transferAmount, address(0), address(0));
            return reflectionAmount;
        } else {
            (,uint reflectionTransferAmount,,,,) = _getValues(transferAmount, address(0), address(0));
            return reflectionTransferAmount;
        }
    }

    function tokenFromReflection(uint reflectionAmount) public view returns(uint) {
        require(reflectionAmount <= _reflectionTotal, "Amount must be less than total reflections");
        return reflectionAmount / _getRate();
    }

    function excludeAccount(address account) external onlyOwner() {
        require(!_isExcluded[account], "Account is already excluded");
        require(account != router, 'Not allowed to exclude router');
        require(account != feeReceiver, "Can not exclude fee receiver");
        if (_reflectionOwned[account] > 0) {
            _actualOwned[account] = tokenFromReflection(_reflectionOwned[account]);
        }
        _isExcluded[account] = true;
        _excluded.push(account);
    }

    function includeAccount(address account) external onlyOwner() {
        require(_isExcluded[account], "Account is already included");
        for (uint i = 0; i < _excluded.length; i++) {
            if (_excluded[i] == account) {
                _excluded[i] = _excluded[_excluded.length - 1];
                _actualOwned[account] = 0;
                _isExcluded[account] = false;
                _excluded.pop();
                break;
            }
        }
    }

    function _approve(address owner, address spender, uint amount) private {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _transfer(address sender, address recipient, uint amount) private {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");
        require(amount > 0, "Transfer amount must be greater than zero");

        // @dev once all cycles are completed, burn fee will be set to 0 and the protocol
        // reaches its final phase, in which no further supply elasticity will take place
        // and fees will stay at 0

        if (sender != owner() && recipient != owner())
            require(amount <= _MAX_TX_SIZE, "Transfer amount exceeds the maxTxAmount.");

        if (_isExcluded[sender] && !_isExcluded[recipient]) {
            _transferFromExcluded(sender, recipient, amount);
        } else if (!_isExcluded[sender] && _isExcluded[recipient]) {
            _transferToExcluded(sender, recipient, amount);
        } else if (!_isExcluded[sender] && !_isExcluded[recipient]) {
            _transferStandard(sender, recipient, amount);
        } else if (_isExcluded[sender] && _isExcluded[recipient]) {
            _transferBothExcluded(sender, recipient, amount);
        } else {
            _transferStandard(sender, recipient, amount);
        }
    }

    function _transferStandard(address sender, address recipient, uint transferAmount) private {
        uint currentRate =  _getRate();
        (uint reflectionAmount, uint reflectionTransferAmount, uint reflectionFee, uint actualTransferAmount, uint transferFee, uint transferBurn) = _getValues(transferAmount, sender, recipient);
        uint reflectionBurn =  transferBurn * currentRate;
        _reflectionOwned[sender] = _reflectionOwned[sender] - reflectionAmount;
        _reflectionOwned[recipient] = _reflectionOwned[recipient] + reflectionTransferAmount;

        _reflectionOwned[feeReceiver] = _reflectionOwned[feeReceiver] + reflectionFee;

        _burnAndRebase(reflectionBurn, transferFee, transferBurn);
        emit Transfer(sender, recipient, actualTransferAmount);

        if (transferFee > 0) {
            emit Transfer(sender, feeReceiver, transferFee);
        }
    }

    function _transferToExcluded(address sender, address recipient, uint transferAmount) private {
        uint currentRate =  _getRate();
        (uint reflectionAmount, uint reflectionTransferAmount, uint reflectionFee, uint actualTransferAmount, uint transferFee, uint transferBurn) = _getValues(transferAmount, sender, recipient);
        uint reflectionBurn =  transferBurn * currentRate;
        _reflectionOwned[sender] = _reflectionOwned[sender] - reflectionAmount;
        _actualOwned[recipient] = _actualOwned[recipient] + actualTransferAmount;
        _reflectionOwned[recipient] = _reflectionOwned[recipient] + reflectionTransferAmount;

        _reflectionOwned[feeReceiver] = _reflectionOwned[feeReceiver] + reflectionFee;

        _burnAndRebase(reflectionBurn, transferFee, transferBurn);
        emit Transfer(sender, recipient, actualTransferAmount);

        if (transferFee > 0) {
            emit Transfer(sender, feeReceiver, transferFee);
        }
    }

    function _transferFromExcluded(address sender, address recipient, uint transferAmount) private {
        uint currentRate =  _getRate();
        (uint reflectionAmount, uint reflectionTransferAmount, uint reflectionFee, uint actualTransferAmount, uint transferFee, uint transferBurn) = _getValues(transferAmount, sender, recipient);
        uint reflectionBurn =  transferBurn * currentRate;
        _actualOwned[sender] = _actualOwned[sender] - transferAmount;
        _reflectionOwned[sender] = _reflectionOwned[sender] - reflectionAmount;
        _reflectionOwned[recipient] = _reflectionOwned[recipient] + reflectionTransferAmount;

        _reflectionOwned[feeReceiver] = _reflectionOwned[feeReceiver] + reflectionFee;

        _burnAndRebase(reflectionBurn, transferFee, transferBurn);
        emit Transfer(sender, recipient, actualTransferAmount);

        if (transferFee > 0) {
            emit Transfer(sender, feeReceiver, transferFee);
        }
    }

    function _transferBothExcluded(address sender, address recipient, uint transferAmount) private {
        uint currentRate =  _getRate();
        (uint reflectionAmount, uint reflectionTransferAmount, uint reflectionFee, uint actualTransferAmount, uint transferFee, uint transferBurn) = _getValues(transferAmount, sender, recipient);
        uint reflectionBurn =  transferBurn * currentRate;
        _actualOwned[sender] = _actualOwned[sender] - transferAmount;
        _reflectionOwned[sender] = _reflectionOwned[sender] - reflectionAmount;
        _actualOwned[recipient] = _actualOwned[recipient] + actualTransferAmount;
        _reflectionOwned[recipient] = _reflectionOwned[recipient] + reflectionTransferAmount;

        _reflectionOwned[feeReceiver] = _reflectionOwned[feeReceiver] + reflectionFee;

        _burnAndRebase(reflectionBurn, transferFee, transferBurn);
        emit Transfer(sender, recipient, actualTransferAmount);

        if (transferFee > 0) {
            emit Transfer(sender, feeReceiver, transferFee);
        }
    }

    function _burnAndRebase(uint reflectionBurn, uint transferFee, uint transferBurn) private {
        _reflectionTotal = _reflectionTotal - reflectionBurn;
        _actualFeeTotal = _actualFeeTotal + transferFee;
        _actualBurnTotal = _actualBurnTotal + transferBurn;
        _actualBurnCycle = _actualBurnCycle + transferBurn + transferFee;
        _actualTotal = _actualTotal - transferBurn;



        // TODO 
        // 1. remove cycles
        // 2. do not include transferFee in _actualBurnCycle
        // 3. set burnCycleLimit for ownable (1275000)
        // 4. set expand tokens amount (500000)
        // @dev after 1,275,000 tokens burnt, supply is expanded by 500,000 tokens 
        if (_actualBurnCycle >= (1275000 * _DECIMALFACTOR)) {
            //set rebase percent
            uint _tRebaseDelta = 500000 * _DECIMALFACTOR;
            _actualBurnCycle = _actualBurnCycle - (1275000 * _DECIMALFACTOR);

            _rebase(_tRebaseDelta);
        }
    }

    function burn(uint amount) external override returns (bool) {
        address sender  = _msgSender();
        uint balance = balanceOf(sender);
        require(balance >= amount, "Cannot burn more than on balance");
        require(sender == feeReceiver, "Only feeReceiver");

        uint reflectionBurn =  amount * _getRate();
        _reflectionTotal = _reflectionTotal - reflectionBurn;
        _reflectionOwned[sender] = _reflectionOwned[sender] - reflectionBurn;

        _actualBurnTotal = _actualBurnTotal + amount;
        _actualTotal = _actualTotal - amount;

        emit Transfer(sender, address(0), amount);
        return true;
    }

    function _getFee(address sender, address recipient) private view returns (uint fotFee) {
        // buy
        if (dexFOT[sender].buy > 0  || dexFOT[sender].sell > 0) {
            fotFee = dexFOT[sender].buy;
        // sell
        } else if (dexFOT[recipient].buy > 0 || dexFOT[recipient].sell > 0) {
            fotFee = dexFOT[sender].sell;
        }
        // custom fot
        else if (customFOT[sender] > 0) {
            fotFee = customFOT[sender];
        // common fot
        } else {
            fotFee = commonFotFee;
        }
    }

    function _getValues(uint transferAmount, address sender, address recipient) private view returns (uint, uint, uint, uint, uint, uint) {
        (uint actualTransferAmount, uint transferFee, uint transferBurn) = _getActualValues(transferAmount, _getFee(sender, recipient), burnFee);
        (uint reflectionAmount, uint reflectionTransferAmount, uint reflectionFee) = _getReflectionValues(transferAmount, transferFee, transferBurn);
        return (reflectionAmount, reflectionTransferAmount, reflectionFee, actualTransferAmount, transferFee, transferBurn);
    }

    function _getActualValues(uint transferAmount, uint fotFee, uint burnFee) private pure returns (uint, uint, uint) {
        uint transferFee = transferAmount * fotFee / _DIVIDER;
        uint transferBurn = transferAmount * burnFee / _DIVIDER;
        uint actualTransferAmount = transferAmount - transferFee - transferBurn;
        return (actualTransferAmount, transferFee, transferBurn);
    }

    function _getReflectionValues(uint transferAmount, uint transferFee, uint transferBurn) private view returns (uint, uint, uint) {
        uint currentRate =  _getRate();
        uint reflectionAmount = transferAmount * currentRate;
        uint reflectionFee = transferFee * currentRate;
        uint reflectionBurn = transferBurn * currentRate;
        uint reflectionTransferAmount = reflectionAmount - reflectionFee - reflectionBurn;
        return (reflectionAmount, reflectionTransferAmount, reflectionFee);
    }

    function _getRate() private view returns(uint) {
        (uint reflectionSupply, uint actualSupply) = _getCurrentSupply();
        return reflectionSupply / actualSupply;
    }

    function _getCurrentSupply() private view returns(uint, uint) {
        uint reflectionSupply = _reflectionTotal;
        uint actualSupply = _actualTotal;
        for (uint i = 0; i < _excluded.length; i++) {
            if (_reflectionOwned[_excluded[i]] > reflectionSupply || _actualOwned[_excluded[i]] > actualSupply) return (_reflectionTotal, _actualTotal);
            reflectionSupply = reflectionSupply - _reflectionOwned[_excluded[i]];
            actualSupply = actualSupply - _actualOwned[_excluded[i]];
        }
        if (reflectionSupply < _reflectionTotal / _actualTotal) return (_reflectionTotal, _actualTotal);
        return (reflectionSupply, actualSupply);
    }

    function setUserCustomFee(address account, uint fee) external onlyOwner() {
        require(fee + burnFee <= _DIVIDER, "Total fee should be in 0 - 100%");
        require(account != address(0), "Zero address not allowed");
        customFOT[account] = fee;
    }

    function setDexFee(address pair, uint16 buyFee, uint16 sellFee) external onlyOwner() {
        require(pair != address(0), "Zero address not allowed");
        require(buyFee + burnFee <= _DIVIDER, "Total fee should be in 0 - 100%");
        require(sellFee + burnFee <= _DIVIDER, "Total fee should be in 0 - 100%");
        dexFOT[pair] = DexFOT(buyFee, sellFee);
    }

    function setCommonFee(uint fee) external onlyOwner() {
        require(fee + burnFee <= _DIVIDER, "Total fee should be in 0 - 100%");
        commonFotFee = fee;
    }

    function setBurnFee(uint fee) external onlyOwner() {
        require(commonFotFee + fee <= _DIVIDER, "Total fee should be in 0 - 100%");
        burnFee = fee;
    }

    function getBurnFee() public view returns(uint)  {
        return burnFee;
    }

    function getFee() public view returns(uint)  {
        return commonFotFee;
    }

    function _getMaxTxAmount() private pure returns(uint) {
        return _MAX_TX_SIZE;
    }

    function getBurnCycle() public view returns(uint) {
        return _actualBurnCycle;
    }

    function _rebase(uint supplyDelta) internal {
        _actualTotal = _actualTotal + supplyDelta;
    }
}
