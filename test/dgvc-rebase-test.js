const Ganache = require('./helpers/ganache');
const assert = require('assert');
const { BigNumber, utils } = require('ethers');
const { expect } = require('chai');

  describe('DGVC', function() {
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


  });
