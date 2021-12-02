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
    const burnCycle = utils.parseUnits('5000', baseUnit).toBigInt();
    const rebaseDelta = utils.parseUnits('4000', baseUnit).toBigInt();
    const HUNDRED_PERCENT = 10000n;

    let accounts;
    let dgvcProxy;
    let dgvcImplementation;
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

      DGVCImplementation = await ethers.getContractFactory('DGVCImplementation');
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

      await dgvcProxy.setRebaseDelta(rebaseDelta);
      await dgvcProxy.setBurnCycle(burnCycle);

      await ganache.snapshot();
    });

    afterEach('revert', function() { return ganache.revert(); });

    it('should be possible to change ownership', async function() {
      assert.strictEqual(await dgvcProxy.owner(), owner.address);
      assert.strictEqual(await dgvcProxy.router(), router);

      const newOwner = accounts[1];
      await dgvcProxy.transferOwnership(newOwner.address);

      assert.strictEqual(await dgvcProxy.owner(), newOwner.address);
    });

    it("should be possible to change router address", async function () {
      const routerAddress = accounts[8];
      await dgvcProxy.setRouter(routerAddress.address);
      assert.strictEqual(await dgvcProxy.router(), routerAddress.address);
      const routerAddress1 = accounts[9];
      await dgvcProxy.setRouter(routerAddress1.address);
      assert.strictEqual(await dgvcProxy.router(), routerAddress1.address);
    });

    it('should not be able to set router address', async function() {
      const owner = accounts[0];
      await dgvcProxy.transferOwnership(owner.address);
      await expect(dgvcProxy.connect(user).setRouter(router)).to.revertedWith('caller is not the owner');
    });

    it('should be  possible to get old owner', async function() {
      assert.strictEqual(await dgvcProxy.owner(), owner.address);
    });

    it('deployer should be receive all tokens after deploy', async function() {
      const balance = await dgvcProxy.balanceOf(owner.address);
      expect(balance).to.equal(totalSupply);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply);
    });

    it('should be possible to transfer tokens, fees are not set', async function() {
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);

      await dgvcProxy.transfer(user.address, amount);

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount);
      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply);
    });


    it('should be possible to transfer tokens, fees set to 5%, 2.5% - to burn and 2.5% fot, trade cycle updated', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.transfer(user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee /HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address), amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));
    });

    it('should be possible to transfer tokens, trade cycle reached, fees auto set to 5.5%, 2.75% - to burn and 2.75% fot', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('100000', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.transfer(user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      // cycle reached
      amount = utils.parseUnits('1', baseUnit);
      await dgvcProxy.connect(user).transfer(userTwo.address, amount);

      const increasedPartFee = 250n;
      expect(await dgvcProxy.commonBurnFee()).to.equal(increasedPartFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(increasedPartFee);
    });

    it('should be possible reach 15 trade cycles, fees auto set to 12%, 6% - to burn and 6% fot, check total supply after rebase', async function() {
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();
      let fee = 250n;

      for (let i = 0; i < 19; i++) {
        await dgvcProxy.transfer(user.address, amount);

        expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
        expect(await dgvcProxy.commonFotFee()).to.equal(fee);
      }

      const supplyBeforeRebase = await dgvcProxy.totalSupply();
      amount = utils.parseUnits('10000', baseUnit).toBigInt();
      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();

      const rebaseAmount = utils.parseUnits('4000', baseUnit).toBigInt();
      const totalSupplyExpected = supplyBeforeRebase.toBigInt() + rebaseAmount - (amount * fee / HUNDRED_PERCENT)
      expect(supplyAfterRebase, totalSupplyExpected);

      const balanceOwner = await dgvcProxy.balanceOf(owner.address);
      const balanceUser = await dgvcProxy.balanceOf(user.address);
      const balanceFeeReceiver = await dgvcProxy.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpected - 1n));

      fee = 250;
      expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
      expect(await dgvcProxy.commonFotFee()).to.equal(fee);
    });

    it('should be possible to make an admin burn for feeReceiver without trade cycles', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50000', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.transfer(user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      const feeReceiverBalance = amount * partFee / HUNDRED_PERCENT;

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee(), partFee);

      await expect(dgvcProxy.connect(feeReceiver).burn(feeReceiverBalance)).to.emit(dgvcProxy, 'Transfer');

      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);
      expect(await dgvcProxy.totalSupply()).to.equal((totalSupply - (amount * partFee / HUNDRED_PERCENT) - feeReceiverBalance));
      expect(await dgvcProxy.totalBurn()).to.equal((amount * partFee / HUNDRED_PERCENT) + feeReceiverBalance);
    });

    it('should NOT be possible to make an admin burn for NOT feeReceiver without trade cycles.', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50000', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.transfer(user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      const feeReceiverBalance = amount * partFee / HUNDRED_PERCENT;

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await expect(dgvcProxy.connect(user).burn(feeReceiverBalance)).to.revertedWith('Only feeReceiver');
    });

    it('should NOT be possible to make an admin burn for feeReceiver does not have amount tokens.', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50000', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.transfer(user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      const feeReceiverBalance = amount * partFee / HUNDRED_PERCENT;

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await expect(dgvcProxy.connect(feeReceiver).burn(feeReceiverBalance + 1n)).to.revertedWith('Cannot burn more than on balance');
    });

    it('transfer to same user should not multiply user balance / total supply', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);
      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.transfer(owner.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));
    });

    it('should be possible reach 15 trade cycles with needed checks and burn with rebase WITH admin burns, check latest total supply', async function() {
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('10000', baseUnit).toBigInt();
      let fee = 250n;

      for (let i = 0; i < 16; i++) {
        await dgvcProxy.transfer(user.address, amount);
        expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
        expect(await dgvcProxy.commonFotFee()).to.equal(fee);
      }

      let supplyBeforeBurn = await dgvcProxy.totalSupply();
      let totalBurnBeforeBurn = await dgvcProxy.totalBurn();
      let totalFeesBeforeBurn = await dgvcProxy.totalFees();
      let totalBurnWithFeesBeforeBurn = await dgvcProxy.totalBurn();
      let feeReceiverBalance = await dgvcProxy.balanceOf(feeReceiver.address);
      let amountToBurn = utils.parseUnits('500', baseUnit).toBigInt();
      await dgvcProxy.connect(feeReceiver).burn(amountToBurn);

      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BNtoBigInt(feeReceiverBalance) - amountToBurn);
      expect(await dgvcProxy.totalSupply()).to.equal(BNtoBigInt(supplyBeforeBurn) - amountToBurn);
      expect(await dgvcProxy.totalBurn()).to.equal(BNtoBigInt(totalBurnBeforeBurn) + amountToBurn);
      expect(await dgvcProxy.totalBurn()).to.equal(BNtoBigInt(totalBurnWithFeesBeforeBurn) + amountToBurn);
      expect(await dgvcProxy.totalFees()).to.equal(totalFeesBeforeBurn);

      expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
      expect(await dgvcProxy.commonFotFee()).to.equal(fee);

      await dgvcProxy.transfer(user.address, amount);

      expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
      expect(await dgvcProxy.commonFotFee()).to.equal(fee);

      await dgvcProxy.transfer(user.address, amount);
      expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
      expect(await dgvcProxy.commonFotFee()).to.equal(fee);

      supplyBeforeBurn = BNtoBigInt(await dgvcProxy.totalSupply());
      totalBurnBeforeBurn = await dgvcProxy.totalBurn();
      totalFeesBeforeBurn = await dgvcProxy.totalFees();
      totalBurnWithFeesBeforeBurn = await dgvcProxy.totalBurn();
      feeReceiverBalance = await dgvcProxy.balanceOf(feeReceiver.address);
      amountToBurn = utils.parseUnits('4000', baseUnit).toBigInt();
      await dgvcProxy.connect(feeReceiver).burn(amountToBurn);

      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(BNtoBigInt(feeReceiverBalance) - amountToBurn);
      expect(await dgvcProxy.totalSupply()).to.equal(supplyBeforeBurn - amountToBurn);
      expect(await dgvcProxy.totalBurn()).to.equal(BNtoBigInt(totalBurnBeforeBurn) + amountToBurn);
      expect(await dgvcProxy.totalBurn()).to.equal(BNtoBigInt(totalBurnWithFeesBeforeBurn) + amountToBurn);
      expect(await dgvcProxy.totalFees()).to.equal(totalFeesBeforeBurn);

      const supplyBeforeRebase = supplyBeforeBurn - amountToBurn;
      amount = utils.parseUnits('1000000', baseUnit).toBigInt();
      await dgvcProxy.transfer(user.address, amount);

      const supplyAfterRebase = await dgvcProxy.totalSupply();

      const rebaseAmount = utils.parseUnits('4000', baseUnit).toBigInt();
      const totalSupplyExpected = supplyBeforeRebase + rebaseAmount - (amount * fee / HUNDRED_PERCENT)
      expect(supplyAfterRebase).to.equal(totalSupplyExpected);

      const balanceOwner = BNtoBigInt(await dgvcProxy.balanceOf(owner.address));
      const balanceUser = BNtoBigInt(await dgvcProxy.balanceOf(user.address));
      const balanceFeeReceiver = BNtoBigInt(await dgvcProxy.balanceOf(feeReceiver.address));
      expect(balanceOwner + balanceUser + balanceFeeReceiver).to.equal(totalSupplyExpected - 2n);


      fee = 250;
      expect(await dgvcProxy.commonBurnFee()).to.equal(fee);
      expect(await dgvcProxy.commonFotFee()).to.equal(fee);
    });


    it('should be possible to transfer tokens via transferFrom, fees set to 5%, 2.5% - to burn and 2.5% fot, trade cycle updated', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.approve(userTwo.address, amount);
      await dgvcProxy.connect(userTwo).transferFrom(owner.address, user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));
    });

    it('should NOT be possible to transfer tokens via transferFrom, if sender does not have enough allowance', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.approve(userTwo.address, amount - 1n);

      await expect(dgvcProxy.connect(userTwo).transferFrom(owner.address, user.address, amount)).to.revertedWith('transfer amount exceeds allowance');


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply);
    });

    it('should NOT be possible to transfer tokens via transferFrom, if spent all alowance', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvcProxy.commonBurnFee()).to.equal(0);
      expect(await dgvcProxy.commonFotFee()).to.equal(0);
      await dgvcProxy.setCommonFee(250);
      await dgvcProxy.setBurnFee(250);
      expect(await dgvcProxy.commonBurnFee()).to.equal(partFee);
      expect(await dgvcProxy.commonFotFee()).to.equal(partFee);

      await dgvcProxy.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(0);
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(0);

      expect(await dgvcProxy.totalBurn()).to.equal(0);

      await dgvcProxy.approve(userTwo.address, amount);
      await dgvcProxy.connect(userTwo).transferFrom(owner.address, user.address, amount);


      expect(await dgvcProxy.actualBurnCycle()).to.equal(amount * partFee / HUNDRED_PERCENT);
      expect(await dgvcProxy.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvcProxy.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvcProxy.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvcProxy.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      await expect(dgvcProxy.connect(userTwo).transferFrom(owner.address, user.address, amount)).to.revertedWith('transfer amount exceeds allowance');
    });


  });
