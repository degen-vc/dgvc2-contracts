const UniswapV2Pair = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const Ganache = require('./helpers/ganache');
const deployUniswap = require('./helpers/deployUniswap');
const { BigNumber, utils } = require('ethers');
const { expect, assert } = require('chai');
// const assert = require('assert');

describe('DGVC Custom Transfers', function() {
  const BNtoBigInt = (input) => BigInt(input.toString());
  const BigInttoBN = (input) => BigNumber.from(input.toString());

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const baseUnit = 18;
  const ganache = new Ganache();

  const totalSupply = utils.parseUnits('12000000', baseUnit).toBigInt();
  const burnCycle = utils.parseUnits('1275000', baseUnit).toBigInt(); // TODO: change value
  const rebaseDelta = utils.parseUnits('500000', baseUnit).toBigInt(); // TODO: change value
  
  const HUNDRED_PERCENT = 10000n;
  const CUSTOM_FOT_FEE = 500n;
  const CUSTOM_BURN_FEE = 250n;
  const DEX_BURN_FEE = 150n;

  let accounts;
  let dgvc;
  let owner;
  let user;
  let feeReceiver;
  let userTwo;

  let weth;
  let uniswapFactory;
  let uniswapRouter;
  let uniswapPair;
  let pairAddress;

  before('setup others', async function() {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    user = accounts[1];
    feeReceiver = accounts[2];
    userTwo = accounts[3];

    const contracts = await deployUniswap(accounts);

    weth = contracts.weth;
    uniswapFactory = contracts.uniswapFactory;
    uniswapRouter = contracts.uniswapRouter;

    const DGVC = await ethers.getContractFactory('DGVC');
    dgvc = await DGVC.deploy(uniswapRouter.address);
    await dgvc.deployed();

    await dgvc.setRebaseDelta(rebaseDelta);
    await dgvc.setBurnCycle(burnCycle)

    await uniswapFactory.createPair(weth.address, dgvc.address);
    pairAddress = await uniswapFactory.getPair(weth.address, dgvc.address);
    uniswapPair = await ethers.getContractAt(UniswapV2Pair.abi, pairAddress);

    const liquidityDgvcAmount = utils.parseUnits('10000', baseUnit);
    const liquidityETHAmount = utils.parseEther('10');

    await dgvc.approve(uniswapRouter.address, liquidityDgvcAmount);
    await expect(uniswapRouter.addLiquidityETH(
      dgvc.address,
      liquidityDgvcAmount,
      0,
      0,
      owner.address,
      new Date().getTime() + 3000,
      { value: liquidityETHAmount }
    )).to.emit(uniswapPair, 'Mint');

    await ganache.snapshot();
});

  afterEach('revert', function() { return ganache.revert(); });

  // User has customFee. custom burn. Transfers 1000 tokens, Check burn cycle increased, total supply decreased. Custom fees applied.
  it('should be possible to do a custom transfer of 1000 DGVC for a user with custom fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));
  });

  // User has customFee. custom burn. DEX fees initiated. User buys 1000 tokens on dex, Check burn cycle increased, total supply decreased. Dex fees applied for buy operation.
  it('should be possible to do a custom fee transfer (buy operation) with DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 600n;
    const BUY_FEE = 400n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    expect(await dgvc.balanceOf(user.address)).to.equal(0);

    // swap with no fees
    await uniswapRouter.connect(user).swapETHForExactTokens(
      amount,
      [weth.address, dgvc.address],
      user.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    expect(await dgvc.balanceOf(user.address)).to.equal(amount);

    await dgvc.setDexFee(uniswapPair.address, BUY_FEE, SELL_FEE, CUSTOM_BURN_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(BUY_FEE));
    expect(sell).to.equal(BigInttoBN(SELL_FEE));
    expect(burn).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await uniswapRouter.connect(userTwo).swapETHForExactTokens(
      amount,
      [weth.address, dgvc.address],
      userTwo.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * (BUY_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvc.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * BUY_FEE / HUNDRED_PERCENT);
  });

  // User has customFee. custom burn. DEX fees initiated and equals to zero. User buys 1000 tokens on dex, Check burn cycle the same, total supply the same. Dex fees not applied. Custom fees not applied as well.
  it('should be possible to do a custom fee transfer (buy operation) with zero values DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 600n;
    const BUY_FEE = 400n;
    const ZERO_FEE = 0n;

    const totalSupplyBefore = await dgvc.totalSupply();

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { enabled: customEnableAfrer, fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    expect(await dgvc.balanceOf(user.address)).to.equal(0);

    // swap with no fees
    await uniswapRouter.connect(user).swapETHForExactTokens(
      amount,
      [weth.address, dgvc.address],
      user.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    expect(await dgvc.balanceOf(user.address)).to.equal(amount);

    await dgvc.setDexFee(uniswapPair.address, ZERO_FEE, ZERO_FEE, ZERO_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(ZERO_FEE));
    expect(sell).to.equal(BigInttoBN(ZERO_FEE));
    expect(burn).to.equal(BigInttoBN(ZERO_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);   

    await uniswapRouter.connect(userTwo).swapETHForExactTokens(
      amount,
      [weth.address, dgvc.address],
      userTwo.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    const totalSupplyAfter = await dgvc.totalSupply();

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(totalSupplyAfter).to.equal(totalSupplyBefore);
  });

  // User has customFee. custom burn. DEX fees initiated. User sells 1000 tokens on dex, Check burn cycle increased, total supply decreased. Dex fees applied for sell operation.
  it('should be possible to do a custom fee transfer (sell operation) with DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const DEX_SELL_FEE = 600n;
    const DEX_BUY_FEE = 400n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);
    
    expect(await dgvc.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));

    const userTwoAmount = await dgvc.balanceOf(userTwo.address);

    await dgvc.connect(userTwo).approve(uniswapRouter.address, userTwoAmount);

    await dgvc.setDexFee(uniswapPair.address, DEX_BUY_FEE, DEX_SELL_FEE, DEX_BURN_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(DEX_BUY_FEE));
    expect(sell).to.equal(BigInttoBN(DEX_SELL_FEE));
    expect(burn).to.equal(BigInttoBN(DEX_BURN_FEE));

    const actualBurnCycleBefore = await dgvc.actualBurnCycle();
    const totalBurnBefore = await dgvc.totalBurn();
    const totalSupplyBefore = await dgvc.totalSupply();
    const balanceOfFeeReceiverBefore = await dgvc.balanceOf(feeReceiver.address);
    const balanceBefore = await ethers.provider.getBalance(userTwo.address);
    const uniswapPairBefore = await dgvc.balanceOf(uniswapPair.address);

    // swap with fees
    await uniswapRouter.connect(userTwo).swapExactTokensForETHSupportingFeeOnTransferTokens(
      userTwoAmount,
      0,
      [dgvc.address, weth.address],
      userTwo.address,
      new Date().getTime() + 3000     
    );
    
    const balanceAfter = await ethers.provider.getBalance(userTwo.address);
    assert.isTrue(balanceAfter.gt(balanceBefore));

    expect(await dgvc.actualBurnCycle()).to.equal(BNtoBigInt(actualBurnCycleBefore) + (BNtoBigInt(userTwoAmount) * DEX_BURN_FEE / HUNDRED_PERCENT));    
    expect(await dgvc.totalBurn()).to.equal( BNtoBigInt(totalBurnBefore) + (BNtoBigInt(userTwoAmount) * DEX_BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(userTwo.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address), balanceOfFeeReceiverBefore + (BNtoBigInt(userTwoAmount) * DEX_SELL_FEE / HUNDRED_PERCENT));
    expect(await dgvc.totalSupply()).to.equal( BNtoBigInt(totalSupplyBefore) - (BNtoBigInt(userTwoAmount) * DEX_BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(uniswapPair.address)).to.equal(BNtoBigInt(uniswapPairBefore) + (BNtoBigInt(userTwoAmount) - (BNtoBigInt(userTwoAmount) * (DEX_SELL_FEE + DEX_BURN_FEE) / HUNDRED_PERCENT)));   
  });

  // User has customFee. custom burn. DEX fees initiated and equals to zero. User sells 1000 tokens on dex, Check burn cycle the same, total supply the same. Dex fees not applied. Custom fees not applied as well.
  it('should be possible to do a custom fee transfer (sell operation) with zero DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 600n;
    const BUY_FEE = 400n;
    const ZERO_FEE = 0n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));

    const userTwoAmount = await dgvc.balanceOf(userTwo.address);

    await dgvc.connect(userTwo).approve(uniswapRouter.address, userTwoAmount);

    await dgvc.setDexFee(uniswapPair.address, ZERO_FEE, ZERO_FEE, ZERO_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(ZERO_FEE));
    expect(sell).to.equal(BigInttoBN(ZERO_FEE));
    expect(burn).to.equal(BigInttoBN(ZERO_FEE));

    const balanceBefore = await ethers.provider.getBalance(userTwo.address);
    await uniswapRouter.connect(userTwo).swapExactTokensForETHSupportingFeeOnTransferTokens(
      userTwoAmount,
      0,
      [dgvc.address, weth.address],
      userTwo.address,
      new Date().getTime() + 3000     
    );  
    const balanceAfter = await ethers.provider.getBalance(userTwo.address);
    assert.isTrue(balanceAfter.gt(balanceBefore));

    expect(await dgvc.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.balanceOf(userTwo.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));    
  });
});