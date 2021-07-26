const Ganache = require('./helpers/ganache');
const assert = require('assert');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');

  describe('DGVC Rebase', function() {
    const BNtoBigInt = (input) => BigInt(input.toString());
    const BigInttoBN = (input) => BigNumber.from(input.toString());

    const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const ganache = new Ganache();
    const baseUnit = 18;
    const totalSupply = utils.parseUnits('12000000', baseUnit).toBigInt();
    let burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
    let rebaseDelta = utils.parseUnits('4000', baseUnit).toBigInt();
    const HUNDRED_PERCENT = 10000n;

    let accounts;
    let dgvcImplementation;
    let dgvcProxy;
    let owner;
    let user;
    let feeReceiver;
    let userTwo;

    before('setup others', async function() {
      accounts = await ethers.getSigners();
      owner = accounts[0];
      user = accounts[1];
      feeReceiver = accounts[2];
      userTwo = accounts[3];

      const DGVCImplementation = await ethers.getContractFactory('DGVCImplementation');
      dgvcImplementation = await DGVCImplementation.deploy();
      await dgvcImplementation.deployed();

      //lock implementation
      await dgvcImplementation.init(router);
      await dgvcImplementation.renounceOwnership();

      //setup proxy
      const DGVCProxy = await ethers.getContractFactory('DGVCProxy');
      dgvcProxy = await DGVCProxy.deploy();
      await dgvcProxy.deployed();

      await dgvcProxy.setImplementation(dgvcImplementation.address);

      dgvcProxy = new ethers.Contract(dgvcProxy.address, DGVCImplementation.interface, owner);
      await dgvcProxy.init(router);

      await ganache.snapshot();
    });

    afterEach('revert', function() { return ganache.revert(); });

    it('rebase delta set, burn limit set (rebase amount is MORE than burned amount). 1 User make transfers and reach rebase limit. check all balances, total supply after rebase.', async () => {
      burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('1000000', baseUnit).toBigInt();

      await dgvcProxy.setRebaseDelta(rebaseDelta);
      await dgvcProxy.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(commonFee);
      await dgvcProxy.setBurnFee(commonBurnFee);
      expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();

      for (let i = 0; i < 16; i++) {
        await dgvcProxy.transfer(user.address, amount);

        expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);
      }


      let transfersCount = 16n;
      const totalSupplyBeforeRebase = await dgvcProxy.totalSupply()
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();

      const rebaseAmount = utils.parseUnits('1000000', baseUnit).toBigInt();

      transfersCount = 17n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvcProxy.balanceOf(owner.address);
      const balanceUser = await dgvcProxy.balanceOf(user.address);
      const balanceFeeReceiver = await dgvcProxy.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase - 2n));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('rebase delta set, burn limit set (rebase amount is LESS than burned amount). 2 Users make transfers and reach rebase limit. check all balances, total supply after rebase.', async () => {
      burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('200', baseUnit).toBigInt();

      await dgvcProxy.setRebaseDelta(rebaseDelta);
      await dgvcProxy.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(commonFee);
      await dgvcProxy.setBurnFee(commonBurnFee);
      expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();

      for (let i = 0; i < 16; i++) {
        await dgvcProxy.transfer(user.address, amount);

        expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);
      }

      let transfersCount = 16n;
      const totalSupplyBeforeRebase = await dgvcProxy.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();
      const rebaseAmount = utils.parseUnits('200', baseUnit).toBigInt();

      transfersCount = 17n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);

      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvcProxy.balanceOf(owner.address);
      const balanceUser = await dgvcProxy.balanceOf(user.address);
      const balanceFeeReceiver = await dgvcProxy.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase - 1n));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('rebase delta is 0, burn limit is 0', async () => {
      burnCycle = utils.parseUnits('0', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('0', baseUnit).toBigInt();

      await dgvcProxy.setRebaseDelta(rebaseDelta);
      await dgvcProxy.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(commonFee);
      await dgvcProxy.setBurnFee(commonBurnFee);
      expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();

      for (let i = 0; i < 16; i++) {
        await dgvcProxy.transfer(user.address, amount);

        expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);
      }

      let transfersCount = 16n;
      const totalSupplyBeforeRebase = await dgvcProxy.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();
      const rebaseAmount = utils.parseUnits('0', baseUnit).toBigInt();

      transfersCount = 17n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);

      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvcProxy.balanceOf(owner.address);
      const balanceUser = await dgvcProxy.balanceOf(user.address);
      const balanceFeeReceiver = await dgvcProxy.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('small burn cycle, rebase should happen', async () => {
      burnCycle = utils.parseUnits('3', baseUnit).toBigInt();;
      rebaseDelta = utils.parseUnits('200', baseUnit).toBigInt();

      await dgvcProxy.setRebaseDelta(rebaseDelta);
      await dgvcProxy.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(commonFee);
      await dgvcProxy.setBurnFee(commonBurnFee);
      expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50', baseUnit).toBigInt();
      
      await dgvcProxy.transfer(user.address, amount);

      let transfersCount = 1n;
      const totalSupplyBeforeRebase = await dgvcProxy.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();
      const rebaseAmount = utils.parseUnits('200', baseUnit).toBigInt();

      transfersCount = 2n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);

      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvcProxy.balanceOf(owner.address);
      const balanceUser = await dgvcProxy.balanceOf(user.address);
      const balanceFeeReceiver = await dgvcProxy.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase - 2n));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('rebase delta set, burn limit set (rebase amount is LESS than burned amount). 1st User makes transfers, 2nd User makes trades and reaches rebase limit. check all balances, total supply after rebase.', async () => {
      // precondition add liquidity
      const UniswapV2Pair = require("@uniswap/v2-core/build/UniswapV2Pair.json");
      const deployUniswap = require('./helpers/deployUniswap');

      let weth;
      let uniswapFactory;
      let uniswapRouter;
      let uniswapPair;
      let pairAddress;

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

      const liquidityDgvcAmount = utils.parseUnits('200000', baseUnit);
      const liquidityETHAmount = utils.parseEther('200');

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


      // test
      const DEX_SELL_FEE = 600n;
      const DEX_BUY_FEE = 400n;
      const DEX_BURN_FEE = 250n;

      burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('200', baseUnit).toBigInt();

      await dgvcProxy.setBurnCycle(burnCycle);
      await dgvcProxy.setRebaseDelta(rebaseDelta);

      const commonFee = 200n;
      const commonBurnFee = 300n;
      
      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(commonFee);
      await dgvcProxy.setBurnFee(commonBurnFee);
      expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);

      let amount = utils.parseUnits('10000', baseUnit).toBigInt(); // for transfer
      let amount2 = utils.parseUnits('1000', baseUnit).toBigInt(); // for dex

      await dgvcProxy.setDexFee(uniswapPair.address, DEX_BUY_FEE, DEX_SELL_FEE, DEX_BURN_FEE);

      const { buy, sell, burn } = await dgvcProxy.dexFOT(uniswapPair.address);

      expect(buy).to.equal(BigInttoBN(DEX_BUY_FEE));
      expect(sell).to.equal(BigInttoBN(DEX_SELL_FEE));
      expect(burn).to.equal(BigInttoBN(DEX_BURN_FEE));

      await dgvcProxy.setFeeReceiver(feeReceiver.address);

      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
      expect(await dgvcProxy.totalBurn()).to.equal(0);

      for (let i = 0; i < 15; i++) {

        await dgvcProxy.transfer(user.address, amount);

        await uniswapRouter.connect(userTwo).swapETHForExactTokens(
          amount2,
          [weth.address, dgvcProxy.address],
          userTwo.address,
          new Date().getTime() + 3000,
          { value: utils.parseEther('2') }
        );

        expect(await dgvcProxy.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvcProxy.commonFotFee()).to.equal(commonFee);
      }

      let transfersCount = 15n;
      const totalSupplyBeforeRebase = await dgvcProxy.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT)  - (amount2 * DEX_BURN_FEE * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const userTwoBalanceExpectedBeforeRebase = (amount2 * transfersCount) - (amount2 * (DEX_BUY_FEE + DEX_BURN_FEE) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(BigInttoBN(userTwoBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = (amount * commonFee * transfersCount / HUNDRED_PERCENT) + (amount2 * DEX_BUY_FEE * transfersCount / HUNDRED_PERCENT);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();
      const rebaseAmount = utils.parseUnits('200', baseUnit).toBigInt();

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - (amount * commonBurnFee  / HUNDRED_PERCENT);
    
      transfersCountAfterRebase = 16n;

      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCountAfterRebase / HUNDRED_PERCENT) - (amount2 * DEX_BURN_FEE * transfersCount / HUNDRED_PERCENT);
      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const userBalanceExpectedAfterRebase = (amount * transfersCountAfterRebase) - (amount * (commonBurnFee + commonFee) * transfersCountAfterRebase / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));

      const userTwoBalanceExpectedAfterRebase = (amount2 * transfersCount) - (amount2 * (DEX_BUY_FEE + DEX_BURN_FEE) * transfersCount / HUNDRED_PERCENT);
      const userTwoRebaseShare = userTwoBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvcProxy.balanceOf(userTwo.address)).to.equal(BigInttoBN(userTwoBalanceExpectedAfterRebase + userTwoRebaseShare));

      const feeReceiverBalanceExpectedAfterRebase = (amount * commonFee * transfersCountAfterRebase / HUNDRED_PERCENT) + (amount2 * DEX_BUY_FEE * transfersCount / HUNDRED_PERCENT);
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / (supplyFromRebase);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));
    });
  });
