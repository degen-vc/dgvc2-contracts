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
    let dgvc;
    let owner;
    let user;
    let feeReceiver;
    let userTwo;

    beforeEach('setup others', async function() {
      accounts = await ethers.getSigners();
      owner = accounts[0];
      user = accounts[1];
      feeReceiver = accounts[2];
      userTwo = accounts[3];
      afterEach('revert', function() { return ganache.revert(); });

      const DGVC = await ethers.getContractFactory('DGVC');
      dgvc = await DGVC.deploy(router);
      await dgvc.deployed();

      await ganache.snapshot();
    });

    it('rebase delta set, burn limit set (rebase amount is MORE than burned amount). 1 User make transfers and reach rebase limit. check all balances, total supply after rebase.', async () => {
      burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('1000000', baseUnit).toBigInt();

      await dgvc.setRebaseDelta(rebaseDelta);
      await dgvc.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvc.commonBurnFee()).to.equal(0);
      expect(await dgvc.commonFotFee()).to.equal(0);
      await dgvc.setCommonFee(commonFee);
      await dgvc.setBurnFee(commonBurnFee);
      expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvc.commonFotFee()).to.equal(commonFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();

      for (let i = 0; i < 16; i++) {
        await dgvc.transfer(user.address, amount);

        expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvc.commonFotFee()).to.equal(commonFee);
      }


      let transfersCount = 16n;
      const totalSupplyBeforeRebase = await dgvc.totalSupply()
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvc.transfer(user.address, amount);

      const supplyAfterRebase = await dgvc.totalSupply();

      const rebaseAmount = utils.parseUnits('1000000', baseUnit).toBigInt();

      transfersCount = 17n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvc.balanceOf(owner.address);
      const balanceUser = await dgvc.balanceOf(user.address);
      const balanceFeeReceiver = await dgvc.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase - 2n));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('rebase delta set, burn limit set (rebase amount is LESS than burned amount). 2 Users make transfers and reach rebase limit. check all balances, total supply after rebase.', async () => {
      burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('200', baseUnit).toBigInt();

      await dgvc.setRebaseDelta(rebaseDelta);
      await dgvc.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvc.commonBurnFee()).to.equal(0);
      expect(await dgvc.commonFotFee()).to.equal(0);
      await dgvc.setCommonFee(commonFee);
      await dgvc.setBurnFee(commonBurnFee);
      expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvc.commonFotFee()).to.equal(commonFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();

      for (let i = 0; i < 16; i++) {
        await dgvc.transfer(user.address, amount);

        expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvc.commonFotFee()).to.equal(commonFee);
      }

      let transfersCount = 16n;
      const totalSupplyBeforeRebase = await dgvc.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvc.transfer(user.address, amount);

      const supplyAfterRebase = await dgvc.totalSupply();
      const rebaseAmount = utils.parseUnits('200', baseUnit).toBigInt();

      transfersCount = 17n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);

      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvc.balanceOf(owner.address);
      const balanceUser = await dgvc.balanceOf(user.address);
      const balanceFeeReceiver = await dgvc.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase - 1n));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('rebase delta is 0, burn limit is 0', async () => {
      burnCycle = utils.parseUnits('0', baseUnit).toBigInt();
      rebaseDelta = utils.parseUnits('0', baseUnit).toBigInt();

      await dgvc.setRebaseDelta(rebaseDelta);
      await dgvc.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvc.commonBurnFee()).to.equal(0);
      expect(await dgvc.commonFotFee()).to.equal(0);
      await dgvc.setCommonFee(commonFee);
      await dgvc.setBurnFee(commonBurnFee);
      expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvc.commonFotFee()).to.equal(commonFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();

      for (let i = 0; i < 16; i++) {
        await dgvc.transfer(user.address, amount);

        expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
        expect(await dgvc.commonFotFee()).to.equal(commonFee);
      }

      let transfersCount = 16n;
      const totalSupplyBeforeRebase = await dgvc.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvc.transfer(user.address, amount);

      const supplyAfterRebase = await dgvc.totalSupply();
      const rebaseAmount = utils.parseUnits('0', baseUnit).toBigInt();

      transfersCount = 17n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);

      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvc.balanceOf(owner.address);
      const balanceUser = await dgvc.balanceOf(user.address);
      const balanceFeeReceiver = await dgvc.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });

    it('small burn cycle, rebase should happen', async () => {
      burnCycle = utils.parseUnits('3', baseUnit).toBigInt();;
      rebaseDelta = utils.parseUnits('200', baseUnit).toBigInt();

      await dgvc.setRebaseDelta(rebaseDelta);
      await dgvc.setBurnCycle(burnCycle)

      const commonFee = 200n;
      const commonBurnFee = 300n;

      expect(await dgvc.commonBurnFee()).to.equal(0);
      expect(await dgvc.commonFotFee()).to.equal(0);
      await dgvc.setCommonFee(commonFee);
      await dgvc.setBurnFee(commonBurnFee);
      expect(await dgvc.commonBurnFee()).to.equal(commonBurnFee);
      expect(await dgvc.commonFotFee()).to.equal(commonFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50', baseUnit).toBigInt();
      
      await dgvc.transfer(user.address, amount);

      let transfersCount = 1n;
      const totalSupplyBeforeRebase = await dgvc.totalSupply();
      const totalSupplyExpectedBeforeRebase = totalSupply - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);
      expect(totalSupplyBeforeRebase).to.equal(totalSupplyExpectedBeforeRebase);

      const ownerBalanceExpectedBeforeRebase = totalSupply - amount * transfersCount;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedBeforeRebase));

      const userBalanceExpectedBeforeRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedBeforeRebase));

      const feeReceiverBalanceExpectedBeforeRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedBeforeRebase));


      await dgvc.transfer(user.address, amount);

      const supplyAfterRebase = await dgvc.totalSupply();
      const rebaseAmount = utils.parseUnits('200', baseUnit).toBigInt();

      transfersCount = 2n;
      const totalSupplyExpectedAfterRebase = totalSupply + rebaseAmount - (amount * commonBurnFee * transfersCount / HUNDRED_PERCENT);

      expect(supplyAfterRebase).to.equal(totalSupplyExpectedAfterRebase);

      const balanceOwner = await dgvc.balanceOf(owner.address);
      const balanceUser = await dgvc.balanceOf(user.address);
      const balanceFeeReceiver = await dgvc.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpectedAfterRebase - 2n));

      const supplyFromRebase = BNtoBigInt(totalSupplyBeforeRebase) - amount * commonBurnFee / HUNDRED_PERCENT;

      const feeReceiverBalanceExpectedAfterRebase = amount * commonFee * transfersCount / HUNDRED_PERCENT;
      const feeReceiverRebaseShare = feeReceiverBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BigInttoBN(feeReceiverBalanceExpectedAfterRebase + feeReceiverRebaseShare));

      const ownerBalanceExpectedAfterRebase = totalSupply - amount * transfersCount;
      const ownerRebaseShare = ownerBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(owner.address)).to.equal(BigInttoBN(ownerBalanceExpectedAfterRebase + ownerRebaseShare));

      const userBalanceExpectedAfterRebase = (amount * transfersCount) - (amount * (commonBurnFee + commonFee) * transfersCount / HUNDRED_PERCENT);
      const userRebaseShare = userBalanceExpectedAfterRebase * rebaseDelta / supplyFromRebase;
      expect(await dgvc.balanceOf(user.address)).to.equal(BigInttoBN(userBalanceExpectedAfterRebase + userRebaseShare));
    });
  });
