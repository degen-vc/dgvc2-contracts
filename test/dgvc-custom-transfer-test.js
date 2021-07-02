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
  const FEE = 500n;
  const PART_FEE = 250n;

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

    afterEach('revert', function() { return ganache.revert(); });
  });

  // User has customFee. custom burn. Transfers 1000 tokens, Check burn cycle increased, total supply decreased. Custom fees applied.
  it.only('should be possible to do a custom transfer of 1000 DGVC for a user with custom fee / burn', async function () {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, FEE, PART_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(PART_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    // expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);

    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    // expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * FEE / HUNDRED_PERCENT) - (amount * PART_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));
  });

  it.only('should be possible to do a custom fee transfer (buy operation) with DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 500n;
    const BUY_FEE = 500n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, FEE, PART_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(PART_FEE));

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

    await dgvc.setDexFee(uniswapPair.address, BUY_FEE, SELL_FEE, PART_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(BUY_FEE));
    expect(sell).to.equal(BigInttoBN(SELL_FEE));
    expect(burn).to.equal(BigInttoBN(PART_FEE));

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

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * (BUY_FEE + PART_FEE) / HUNDRED_PERCENT));
    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * BUY_FEE / HUNDRED_PERCENT);
  });

  // User has customFee. custom burn. DEX fees initiated and equals to zero. User buys 1000 tokens on dex, Check burn cycle the same, total supply the same. Dex fees not applied. Custom fees not applied as well
  it.only('should be possible to do a custom fee transfer (buy operation) with zero values DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 500n;
    const BUY_FEE = 500n;
    const ZERO_FEE = 0;

    const totalSupplyBefore = await dgvc.totalSupply();

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, FEE, PART_FEE);

    const { enabled: customEnableAfrer, fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(PART_FEE));

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

    console.log(await dgvc.balanceOf(userTwo.address))
    console.log(await dgvc.actualBurnCycle())
    console.log(await dgvc.totalSupply())

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

    console.log(await dgvc.balanceOf(userTwo.address))
    console.log(await dgvc.actualBurnCycle())
    console.log(await dgvc.totalSupply())

    const totalSupplyAfter = await dgvc.totalSupply();

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(totalSupplyAfter).to.equal(totalSupplyBefore);
  });

  // User has customFee. custom burn. DEX fees initiated. User sells 1000 tokens on dex, Check burn cycle increased, total supply decreased. Dex fees applied for sell operation.
  it.only('should be possible to do a custom fee transfer (sell operation) with DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 500n;
    const BUY_FEE = 500n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, FEE, PART_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(PART_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    // expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);

    console.log('actualBurnCycle', (await dgvc.actualBurnCycle()).toString())
    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    // expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * FEE / HUNDRED_PERCENT) - (amount * PART_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * PART_FEE / HUNDRED_PERCENT);

    console.log('totalSupply', (await dgvc.totalSupply()).toString())
    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));

    const userTwoAmount = await dgvc.balanceOf(userTwo.address);

    await dgvc.connect(userTwo).approve(uniswapRouter.address, userTwoAmount);

    await dgvc.setDexFee(uniswapPair.address, BUY_FEE, SELL_FEE, PART_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(BUY_FEE));
    expect(sell).to.equal(BigInttoBN(SELL_FEE));
    expect(burn).to.equal(BigInttoBN(PART_FEE));

    const actualBurnCycleBefore = await dgvc.actualBurnCycle();
    const totalSupplyBefore = await dgvc.totalSupply();

    const balanceBefore = await ethers.provider.getBalance(userTwo.address)
    console.log(balanceBefore.toString())
    await uniswapRouter.connect(userTwo).swapExactTokensForETHSupportingFeeOnTransferTokens(
      userTwoAmount,
      0,
      [dgvc.address, weth.address],
      userTwo.address,
      new Date().getTime() + 3000     
    );
    
    const balanceAfter = await ethers.provider.getBalance(userTwo.address);
    const actualBurnCycleAfter = await dgvc.actualBurnCycle();
    const totalSupplyAfter = await dgvc.totalSupply();

    assert.isTrue(balanceAfter.gt(balanceBefore));
    assert.isTrue(actualBurnCycleAfter.gt(actualBurnCycleBefore));
    assert.isTrue(totalSupplyBefore.gt(totalSupplyAfter));

    // console.log('actualBurnCycle', (await dgvc.actualBurnCycle()).toString())
    // expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    // console.log('totalSupply', (await dgvc.totalSupply()).toString())
    // expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT) - (amount * SELL_FEE / HUNDRED_PERCENT));
  });

  // User has customFee. custom burn. DEX fees initiated and equals to zero. User sells 1000 tokens on dex, Check burn cycle the same, total supply the same. Dex fees not applied. Custom fees not applied as well
  it.only('should be possible to do a custom fee transfer (sell operation) with zero DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 500n;
    const BUY_FEE = 500n;
    const ZERO_FEE = 0;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvc.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvc.setUserCustomFee(user.address, FEE, PART_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvc.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(PART_FEE));

    await dgvc.setFeeReceiver(feeReceiver.address);

    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvc.actualBurnCycle()).to.equal(0);
    expect(await dgvc.totalBurn()).to.equal(0);

    await dgvc.transfer(user.address, amount);
    await dgvc.connect(user).transfer(userTwo.address, amount);

    console.log('actualBurnCycle', (await dgvc.actualBurnCycle()).toString())
    expect(await dgvc.actualBurnCycle()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);
    expect(await dgvc.totalBurn()).to.equal(amount * PART_FEE / HUNDRED_PERCENT);

    expect(await dgvc.balanceOf(userTwo.address)).to.equal(amount - (amount * FEE / HUNDRED_PERCENT) - (amount * PART_FEE / HUNDRED_PERCENT));
    expect(await dgvc.balanceOf(feeReceiver.address), amount * PART_FEE / HUNDRED_PERCENT);

    console.log('totalSupply', (await dgvc.totalSupply()).toString())
    expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * PART_FEE / HUNDRED_PERCENT));

    const userTwoAmount = await dgvc.balanceOf(userTwo.address);
    console.log((userTwoAmount).toString())
    console.log(amount)

    await dgvc.connect(userTwo).approve(uniswapRouter.address, userTwoAmount);

    await dgvc.setDexFee(uniswapPair.address, ZERO_FEE, ZERO_FEE, ZERO_FEE);

    const { buy, sell, burn } = await dgvc.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(ZERO_FEE));
    expect(sell).to.equal(BigInttoBN(ZERO_FEE));
    expect(burn).to.equal(BigInttoBN(ZERO_FEE));

    const actualBurnCycleBefore = await dgvc.actualBurnCycle();
    const totalSupplyBefore = await dgvc.totalSupply();

    const balanceBefore = await ethers.provider.getBalance(userTwo.address);
    console.log('balanceBefore' , balanceBefore.toString());
    await uniswapRouter.connect(userTwo).swapExactTokensForETHSupportingFeeOnTransferTokens(
      userTwoAmount,
      0,
      [dgvc.address, weth.address],
      userTwo.address,
      new Date().getTime() + 3000     
    );
    
    const balanceAfter = await ethers.provider.getBalance(userTwo.address);
    const actualBurnCycleAfter = await dgvc.actualBurnCycle();
    const totalSupplyAfter = await dgvc.totalSupply();

    assert.isTrue(balanceAfter.gt(balanceBefore));
    expect(actualBurnCycleAfter).to.equal(actualBurnCycleBefore);
    expect(totalSupplyBefore).to.equal(totalSupplyAfter);

    // Custom fees not applied as well - ?

    console.log('actualBurnCycle', (await dgvc.actualBurnCycle()).toString());
    console.log('totalSupply', (await dgvc.totalSupply()).toString());
    
  });
});