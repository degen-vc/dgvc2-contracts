const UniswapV2Pair = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const Ganache = require('./helpers/ganache');
const deployUniswap = require('./helpers/deployUniswap');
const { BigNumber, utils } = require('ethers');
const { expect, assert } = require('chai');
// const assert = require('assert');

describe('DGVC Custom Transfers', function() {
  const BNtoBigInt = (input) => BigInt(input.toString());
  const BigInttoBN = (input) => BigNumber.from(input.toString());

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
  let dgvcImplementation;
  let dgvcProxy;
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

    const DGVCImplementation = await ethers.getContractFactory('DGVCImplementation');
    dgvcImplementation = await DGVCImplementation.deploy();
    await dgvcImplementation.deployed();

    //lock implementation
    await dgvcImplementation.init(uniswapRouter.address);
    await dgvcImplementation.renounceOwnership();

    //setup proxy
    const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
    dgvcProxy = await DGVCProxy.deploy();
    await dgvcProxy.deployed();

    await dgvcProxy.setImplementation(dgvcImplementation.address);

    dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCImplementation.interface, owner);
    await dgvcProxy.init(uniswapRouter.address);


    await dgvcProxy.setRebaseDelta(rebaseDelta);
    await dgvcProxy.setBurnCycle(burnCycle);

    await uniswapFactory.createPair(weth.address, dgvcProxy.address);
    pairAddress = await uniswapFactory.getPair(weth.address, dgvcProxy.address);
    uniswapPair = await ethers.getContractAt(UniswapV2Pair.abi, pairAddress);

    const liquidityDgvcAmount = utils.parseUnits('10000', baseUnit);
    const liquidityETHAmount = utils.parseEther('10');

    await dgvcProxy.approve(uniswapRouter.address, liquidityDgvcAmount);

    await expect(uniswapRouter.addLiquidityETH(
      dgvcProxy.address,
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

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvcProxy.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvcProxy.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);
    await dgvcProxy.connect(user).transfer(userTwo.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(amount - (amount * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));
  });

  // User has customFee. custom burn. DEX fees initiated. User buys 1000 tokens on dex, Check burn cycle increased, total supply decreased. Dex fees applied for buy operation.
  it('should be possible to do a custom fee transfer (buy operation) with DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 600n;
    const BUY_FEE = 400n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvcProxy.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvcProxy.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);

    // swap with no fees
    await uniswapRouter.connect(user).swapETHForExactTokens(
      amount,
      [weth.address, dgvcProxy.address],
      user.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount);

    await dgvcProxy.setDexFee(uniswapPair.address, BUY_FEE, SELL_FEE, CUSTOM_BURN_FEE);

    const { buy, sell, burn } = await dgvcProxy.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(BUY_FEE));
    expect(sell).to.equal(BigInttoBN(SELL_FEE));
    expect(burn).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await uniswapRouter.connect(userTwo).swapETHForExactTokens(
      amount,
      [weth.address, dgvcProxy.address],
      userTwo.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(amount - (amount * (BUY_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * BUY_FEE / HUNDRED_PERCENT);
  });

  // User has customFee. custom burn. DEX fees initiated and equals to zero. User buys 1000 tokens on dex, Check burn cycle the same, total supply the same. Dex fees not applied. Custom fees not applied as well.
  it('should be possible to do a custom fee transfer (buy operation) with zero values DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 600n;
    const BUY_FEE = 400n;
    const ZERO_FEE = 0n;

    const totalSupplyBefore = await dgvcProxy.totalSupply();

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvcProxy.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { enabled: customEnableAfrer, fot: customFeeAfter, burn: customBurnAfter } = await dgvcProxy.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);

    // swap with no fees
    await uniswapRouter.connect(user).swapETHForExactTokens(
      amount,
      [weth.address, dgvcProxy.address],
      user.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount);

    await dgvcProxy.setDexFee(uniswapPair.address, ZERO_FEE, ZERO_FEE, ZERO_FEE);

    const { buy, sell, burn } = await dgvcProxy.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(ZERO_FEE));
    expect(sell).to.equal(BigInttoBN(ZERO_FEE));
    expect(burn).to.equal(BigInttoBN(ZERO_FEE));

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);   

    await uniswapRouter.connect(userTwo).swapETHForExactTokens(
      amount,
      [weth.address, dgvcProxy.address],
      userTwo.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );

    const totalSupplyAfter = await dgvcProxy.totalSupply();

    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(amount);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(totalSupplyAfter).to.equal(totalSupplyBefore);
  });

  // User has customFee. custom burn. DEX fees initiated. User sells 1000 tokens on dex, Check burn cycle increased, total supply decreased. Dex fees applied for sell operation.
  it('should be possible to do a custom fee transfer (sell operation) with DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const DEX_SELL_FEE = 600n;
    const DEX_BUY_FEE = 400n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvcProxy.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvcProxy.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);
    await dgvcProxy.connect(user).transfer(userTwo.address, amount);
    
    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(amount - (amount * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));

    const userTwoAmount = await dgvcProxy.balanceOf(userTwo.address);

    await dgvcProxy.connect(userTwo).approve(uniswapRouter.address, userTwoAmount);

    await dgvcProxy.setDexFee(uniswapPair.address, DEX_BUY_FEE, DEX_SELL_FEE, DEX_BURN_FEE);

    const { buy, sell, burn } = await dgvcProxy.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(DEX_BUY_FEE));
    expect(sell).to.equal(BigInttoBN(DEX_SELL_FEE));
    expect(burn).to.equal(BigInttoBN(DEX_BURN_FEE));

    const actualBurnCycleBefore = await dgvcProxy.actualBurnCycle();
    const totalBurnBefore = await dgvcProxy.totalBurn();
    const totalSupplyBefore = await dgvcProxy.totalSupply();
    const balanceOfFeeReceiverBefore = await dgvcProxy.balanceOf(feeReceiver.address);
    const balanceBefore = await ethers.provider.getBalance(userTwo.address);
    const uniswapPairBefore = await dgvcProxy.balanceOf(uniswapPair.address);

    // swap with fees
    await uniswapRouter.connect(userTwo).swapExactTokensForETHSupportingFeeOnTransferTokens(
      userTwoAmount,
      0,
      [dgvcProxy.address, weth.address],
      userTwo.address,
      new Date().getTime() + 3000     
    );
    
    const balanceAfter = await ethers.provider.getBalance(userTwo.address);
    assert.isTrue(balanceAfter.gt(balanceBefore));

    expect(await dgvcProxy.actualBurnCycle()).to.equal(BNtoBigInt(actualBurnCycleBefore) + (BNtoBigInt(userTwoAmount) * DEX_BURN_FEE / HUNDRED_PERCENT));    
    expect(await dgvcProxy.totalBurn()).to.equal( BNtoBigInt(totalBurnBefore) + (BNtoBigInt(userTwoAmount) * DEX_BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address), balanceOfFeeReceiverBefore + (BNtoBigInt(userTwoAmount) * DEX_SELL_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.totalSupply()).to.equal( BNtoBigInt(totalSupplyBefore) - (BNtoBigInt(userTwoAmount) * DEX_BURN_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(uniswapPair.address)).to.equal(BNtoBigInt(uniswapPairBefore) + (BNtoBigInt(userTwoAmount) - (BNtoBigInt(userTwoAmount) * (DEX_SELL_FEE + DEX_BURN_FEE) / HUNDRED_PERCENT)));   
  });

  // User has customFee. custom burn. DEX fees initiated and equals to zero. User sells 1000 tokens on dex, Check burn cycle the same, total supply the same. Dex fees not applied. Custom fees not applied as well.
  it('should be possible to do a custom fee transfer (sell operation) with zero DEX fees initiated and custom fees initiated', async function() {
    const amount = utils.parseUnits('1000', baseUnit).toBigInt();
    const SELL_FEE = 600n;
    const BUY_FEE = 400n;
    const ZERO_FEE = 0n;

    const { fot: customFeeBefore, burn: customBurnBefore } = await dgvcProxy.customFees(user.address);

    expect(customFeeBefore).to.equal(0);
    expect(customBurnBefore).to.equal(0);

    await dgvcProxy.setUserCustomFee(user.address, CUSTOM_FOT_FEE, CUSTOM_BURN_FEE);

    const { fot: customFeeAfter, burn: customBurnAfter } = await dgvcProxy.customFees(user.address);

    expect(customFeeAfter).to.equal(BigInttoBN(CUSTOM_FOT_FEE));
    expect(customBurnAfter).to.equal(BigInttoBN(CUSTOM_BURN_FEE));

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);

    await dgvcProxy.transfer(user.address, amount);
    await dgvcProxy.connect(user).transfer(userTwo.address, amount);

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(amount - (amount * (CUSTOM_FOT_FEE + CUSTOM_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));

    const userTwoAmount = await dgvcProxy.balanceOf(userTwo.address);

    await dgvcProxy.connect(userTwo).approve(uniswapRouter.address, userTwoAmount);

    await dgvcProxy.setDexFee(uniswapPair.address, ZERO_FEE, ZERO_FEE, ZERO_FEE);

    const { buy, sell, burn } = await dgvcProxy.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(ZERO_FEE));
    expect(sell).to.equal(BigInttoBN(ZERO_FEE));
    expect(burn).to.equal(BigInttoBN(ZERO_FEE));

    const balanceBefore = await ethers.provider.getBalance(userTwo.address);
    await uniswapRouter.connect(userTwo).swapExactTokensForETHSupportingFeeOnTransferTokens(
      userTwoAmount,
      0,
      [dgvcProxy.address, weth.address],
      userTwo.address,
      new Date().getTime() + 3000     
    );  
    const balanceAfter = await ethers.provider.getBalance(userTwo.address);
    assert.isTrue(balanceAfter.gt(balanceBefore));

    expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalBurn()).to.equal(amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address), amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * CUSTOM_BURN_FEE / HUNDRED_PERCENT));    
  });

  // User doesn’t have custom fee, custom burn. DEX fees initiated for 2 different dexes(pairs sushi/uni). 
  // User buys 1000 tokens on dex1, Check burn cycle increased, total supply decreased. 
  // Dex1 fees applied for buy operation, User buys 1000 tokens on dex2, 
  // Check burn cycle increased, total supply decreased. Dex2 fees applied for buy operation.

  it('should be possible to buy tokens in two different DEXes, with DEXes fees initiated, and without custom fees', async function() {
    // setup dex2
    let weth2;
    let uniswapFactory2;
    let uniswapRouter2;
    let uniswapPair2;
    let pairAddress2;

    accounts = await ethers.getSigners();

    const contracts2 = await deployUniswap(accounts);

    weth2 = contracts2.weth;
    uniswapFactory2 = contracts2.uniswapFactory;
    uniswapRouter2 = contracts2.uniswapRouter;

    await uniswapFactory2.createPair(weth2.address, dgvcProxy.address);
    pairAddress2 = await uniswapFactory2.getPair(weth2.address, dgvcProxy.address);
    uniswapPair2 = await ethers.getContractAt(UniswapV2Pair.abi, pairAddress2);

    const liquidityDgvcAmount2 = utils.parseUnits('10000', baseUnit);
    const liquidityETHAmount2 = utils.parseEther('10');

    await dgvcProxy.approve(uniswapRouter2.address, liquidityDgvcAmount2);

    await expect(uniswapRouter2.addLiquidityETH(
      dgvcProxy.address,
      liquidityDgvcAmount2,
      0,
      0,
      owner.address,
      new Date().getTime() + 3000,
      { value: liquidityETHAmount2 }
    )).to.emit(uniswapPair2, 'Mint');
    

    // test
    const DEX_BUY_FEE = 400n;
    const DEX_SELL_FEE = 600n;
    const DEX_BURN_FEE = 150n;

    const amount = utils.parseUnits('1000', baseUnit).toBigInt();

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);

    await dgvcProxy.setDexFee(uniswapPair.address, DEX_BUY_FEE, DEX_SELL_FEE, DEX_BURN_FEE);

    const { buy, sell, burn } = await dgvcProxy.dexFOT(uniswapPair.address);

    expect(buy).to.equal(BigInttoBN(DEX_BUY_FEE));
    expect(sell).to.equal(BigInttoBN(DEX_SELL_FEE));
    expect(burn).to.equal(BigInttoBN(DEX_BURN_FEE));

    await dgvcProxy.setFeeReceiver(feeReceiver.address);

    expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
    expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
    expect(await dgvcProxy.totalBurn()).to.equal(0);   

    const balanceBefore = await ethers.provider.getBalance(user.address);
    const balanceOfFeeReceiverBefore = await dgvcProxy.balanceOf(feeReceiver.address);
    const actualBurnCycleBefore = await dgvcProxy.actualBurnCycle();
    const totalSupplyBefore = await dgvcProxy.totalSupply();

    // buy tokens on dex1
    await uniswapRouter.connect(user).swapETHForExactTokens(
      amount,
      [weth.address, dgvcProxy.address],
      user.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('2') }
    );
  
    const balanceAfter = await dgvcProxy.balanceOf(user.address);
    const balanceOfFeeReceiverAfter = await dgvcProxy.balanceOf(feeReceiver.address);
    const actualBurnCycleAfter = await dgvcProxy.actualBurnCycle();
    const totalSupplyAfter = await dgvcProxy.totalSupply();
    
    expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * (DEX_BUY_FEE + DEX_BURN_FEE) / HUNDRED_PERCENT));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * DEX_BUY_FEE / HUNDRED_PERCENT);
    expect(await dgvcProxy.actualBurnCycle()).to.equal((actualBurnCycleBefore) + (BNtoBigInt(amount) * DEX_BURN_FEE / HUNDRED_PERCENT));    
    expect(await dgvcProxy.totalSupply()).to.equal( BNtoBigInt(totalSupplyBefore) - (BNtoBigInt(amount) * (DEX_BURN_FEE ) / HUNDRED_PERCENT));

    // buy tokens on dex2
    const DEX2_BUY_FEE = 350n;
    const DEX2_SELL_FEE = 400n;
    const DEX2_BURN_FEE = 100n;

    const amount2 = utils.parseUnits('2000', baseUnit).toBigInt();

    await dgvcProxy.setDexFee(uniswapPair2.address, DEX2_BUY_FEE, DEX2_SELL_FEE, DEX2_BURN_FEE);

    const { buy: buy2, sell: sell2, burn: burn2 } = await dgvcProxy.dexFOT(uniswapPair2.address);

    expect(buy2).to.equal(BigInttoBN(DEX2_BUY_FEE));
    expect(sell2).to.equal(BigInttoBN(DEX2_SELL_FEE));
    expect(burn2).to.equal(BigInttoBN(DEX2_BURN_FEE));

    await uniswapRouter2.connect(user).swapETHForExactTokens(
      amount2,
      [weth2.address, dgvcProxy.address],
      user.address,
      new Date().getTime() + 3000,
      { value: utils.parseEther('4') }
    );

    expect(await dgvcProxy.balanceOf(user.address)).to.equal( BNtoBigInt(balanceAfter) + (BNtoBigInt(amount2) - BNtoBigInt(amount2 * (DEX2_BUY_FEE + DEX2_BURN_FEE) / HUNDRED_PERCENT)));
    expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal( BNtoBigInt(balanceOfFeeReceiverAfter) + (BNtoBigInt(amount2) * DEX2_BUY_FEE / HUNDRED_PERCENT));
    expect(await dgvcProxy.actualBurnCycle()).to.equal(BNtoBigInt(actualBurnCycleAfter) + (BNtoBigInt(amount2) * DEX2_BURN_FEE / HUNDRED_PERCENT));    
    expect(await dgvcProxy.totalSupply()).to.equal( BNtoBigInt(totalSupplyAfter) - (BNtoBigInt(amount2) * DEX2_BURN_FEE / HUNDRED_PERCENT));
  });
});