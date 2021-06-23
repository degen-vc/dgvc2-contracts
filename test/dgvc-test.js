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
    const totalSupply = utils.parseUnits('100000000', baseUnit).toBigInt();
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

    it('should be possible to change ownership', async function() {
      assert.strictEqual(await dgvc.owner(), owner.address);
      assert.strictEqual(await dgvc.router(), router);

      const newOwner = accounts[1];
      await dgvc.transferOwnership(newOwner.address);

      assert.strictEqual(await dgvc.owner(), newOwner.address);
    });

    it('should be  possible to get old owner', async function() {
      assert.strictEqual(await dgvc.owner(), owner.address);
    });

    it('deployer should be receive all tokens after deploy', async function() {
      const balance = await dgvc.balanceOf(owner.address);
      expect(balance).to.equal(totalSupply);

      expect(await dgvc.totalSupply()).to.equal(totalSupply);
    });

    it('should be possible to transfer tokens, fees are not set', async function() {
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);

      await dgvc.transfer(user.address, amount);

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount);
      expect(await dgvc.totalSupply()).to.equal(totalSupply);
    });


    it('should be possible to transfer tokens, fees set to 5%, 2.5% - to burn and 2.5% fot, trade cycle updated', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.transfer(user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee /HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address), amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));
    });

    it('should be possible to transfer tokens, trade cycle reached, fees auto set to 5.5%, 2.75% - to burn and 2.75% fot', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('1000000', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.transfer(user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      // cycle reached
      amount = utils.parseUnits('1', baseUnit);
      await dgvc.connect(user).transfer(userTwo.address, amount);

      const increasedPartFee = 250n;
      expect(await dgvc.getBurnFee()).to.equal(increasedPartFee);
      expect(await dgvc.getFee()).to.equal(increasedPartFee);
    });

    it('should be possible reach 15 trade cycles, fees auto set to 12%, 6% - to burn and 6% fot, check total supply after rebase', async function() {
      const feeStart = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('1000001', baseUnit).toBigInt();
      let fee = 250n;

      for (let i = 0; i < 25; i++) {
        await dgvc.transfer(user.address, amount);

        expect(await dgvc.getBurnFee()).to.equal(fee);
        expect(await dgvc.getFee()).to.equal(fee);
      }

      amount = utils.parseUnits('416656', baseUnit).toBigInt();
      await dgvc.transfer(user.address, amount);
      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);


      const supplyBeforeRebase = await dgvc.totalSupply();
      amount = utils.parseUnits('100000', baseUnit).toBigInt();
      await dgvc.transfer(user.address, amount);


      const supplyAfterRebase = await dgvc.totalSupply();

      const rebaseAmount = utils.parseUnits('500000', baseUnit).toBigInt();
      const totalSupplyExpected = supplyBeforeRebase.toBigInt() + rebaseAmount - (amount * fee / HUNDRED_PERCENT)
      expect(supplyAfterRebase, totalSupplyExpected);

      const balanceOwner = await dgvc.balanceOf(owner.address);
      const balanceUser = await dgvc.balanceOf(user.address);
      const balanceFeeReceiver = await dgvc.balanceOf(feeReceiver.address);
      expect(BigInttoBN(BNtoBigInt(balanceOwner) + BNtoBigInt(balanceUser) + BNtoBigInt(balanceFeeReceiver))).to.equal(BigInttoBN(totalSupplyExpected - 2n));

      fee = 250;
      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);
    });

    it('should be possible to make an admin burn for feeReceiver without trade cycles', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50000', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.transfer(user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);


      const feeReceiverBalance = amount * partFee / HUNDRED_PERCENT;

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee(), partFee);

      await expect(dgvc.connect(feeReceiver).burn(feeReceiverBalance)).to.emit(dgvc, 'Transfer');

      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);
      expect(await dgvc.totalSupply()).to.equal((totalSupply - (amount * partFee / HUNDRED_PERCENT) - feeReceiverBalance));
      expect(await dgvc.totalBurn()).to.equal((amount * partFee / HUNDRED_PERCENT) + feeReceiverBalance);
    });

    it('should NOT be possible to make an admin burn for NOT feeReceiver without trade cycles.', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50000', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.transfer(user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      const feeReceiverBalance = amount * partFee / HUNDRED_PERCENT;

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await expect(dgvc.connect(user).burn(feeReceiverBalance)).to.revertedWith('Only feeReceiver');
    });

    it('should NOT be possible to make an admin burn for feeReceiver does not have amount tokens.', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('50000', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.transfer(user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      const feeReceiverBalance = amount * partFee / HUNDRED_PERCENT;

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(feeReceiverBalance);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await expect(dgvc.connect(feeReceiver).burn(feeReceiverBalance + 1n)).to.revertedWith('Cannot burn more than on balance');
    });

    it('transfer to same user should not multiply user balance / total supply', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);
      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.transfer(owner.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));
    });

    it('should be possible reach 15 trade cycles with needed checks and burn with rebase WITH admin burns, check latest total supply', async function() {
      const feeStart = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      let amount = utils.parseUnits('1000001', baseUnit).toBigInt();
      let fee = 250n;

      for (let i = 0; i < 23; i++) {
        await dgvc.transfer(user.address, amount);
        expect(await dgvc.getBurnFee()).to.equal(fee);
        expect(await dgvc.getFee()).to.equal(fee);
      }

      let supplyBeforeBurn = await dgvc.totalSupply();
      let totalBurnBeforeBurn = await dgvc.totalBurn();
      let totalFeesBeforeBurn = await dgvc.totalFees();
      let totalBurnWithFeesBeforeBurn = await dgvc.totalBurnWithFees();
      let feeReceiverBalance = await dgvc.balanceOf(feeReceiver.address);
      let amountToBurn = utils.parseUnits('500', baseUnit).toBigInt();
      await dgvc.connect(feeReceiver).burn(amountToBurn);

      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BNtoBigInt(feeReceiverBalance) - amountToBurn);
      expect(await dgvc.totalSupply()).to.equal(BNtoBigInt(supplyBeforeBurn) - amountToBurn);
      expect(await dgvc.totalBurn()).to.equal(BNtoBigInt(totalBurnBeforeBurn) + amountToBurn);
      expect(await dgvc.totalBurnWithFees()).to.equal(BNtoBigInt(totalBurnWithFeesBeforeBurn) + amountToBurn);
      expect(await dgvc.totalFees()).to.equal(totalFeesBeforeBurn);

      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);

      await dgvc.transfer(user.address, amount);
      
      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);

      await dgvc.transfer(user.address, amount);
      
      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);


      amount = utils.parseUnits('416656', baseUnit);
      await dgvc.transfer(user.address, amount);
      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);

      supplyBeforeBurn = BNtoBigInt(await dgvc.totalSupply());
      totalBurnBeforeBurn = await dgvc.totalBurn();
      totalFeesBeforeBurn = await dgvc.totalFees();
      totalBurnWithFeesBeforeBurn = await dgvc.totalBurnWithFees();
      feeReceiverBalance = await dgvc.balanceOf(feeReceiver.address);
      amountToBurn = utils.parseUnits('10000', baseUnit).toBigInt();
      await dgvc.connect(feeReceiver).burn(amountToBurn);

      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(BNtoBigInt(feeReceiverBalance) - amountToBurn);
      expect(await dgvc.totalSupply()).to.equal(supplyBeforeBurn - amountToBurn);
      expect(await dgvc.totalBurn()).to.equal(BNtoBigInt(totalBurnBeforeBurn) + amountToBurn);
      expect(await dgvc.totalBurnWithFees()).to.equal(BNtoBigInt(totalBurnWithFeesBeforeBurn) + amountToBurn);
      expect(await dgvc.totalFees()).to.equal(totalFeesBeforeBurn);

      const supplyBeforeRebase = supplyBeforeBurn - amountToBurn;
      amount = utils.parseUnits('100000', baseUnit).toBigInt();
      await dgvc.transfer(user.address, amount);

      const supplyAfterRebase = await dgvc.totalSupply();

      const rebaseAmount = utils.parseUnits('500000', baseUnit).toBigInt();
      const totalSupplyExpected = supplyBeforeRebase + rebaseAmount - (amount * fee / HUNDRED_PERCENT)
      expect(supplyAfterRebase).to.equal(totalSupplyExpected);

      const balanceOwner = BNtoBigInt(await dgvc.balanceOf(owner.address));
      const balanceUser = BNtoBigInt(await dgvc.balanceOf(user.address));
      const balanceFeeReceiver = BNtoBigInt(await dgvc.balanceOf(feeReceiver.address));
      expect(balanceOwner + balanceUser + balanceFeeReceiver).to.equal(totalSupplyExpected - 2n);


      fee = 250;
      expect(await dgvc.getBurnFee()).to.equal(fee);
      expect(await dgvc.getFee()).to.equal(fee);
    });


    it('should be possible to transfer tokens via transferFrom, fees set to 5%, 2.5% - to burn and 2.5% fot, trade cycle updated', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.approve(userTwo.address, amount);
      await dgvc.connect(userTwo).transferFrom(owner.address, user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));
    });

    it('should NOT be possible to transfer tokens via transferFrom, if sender does not have enough allowance', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.approve(userTwo.address, amount - 1n);

      await expect(dgvc.connect(userTwo).transferFrom(owner.address, user.address, amount)).to.revertedWith('transfer amount exceeds allowance');


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);

      expect(await dgvc.totalSupply()).to.equal(totalSupply);
    });

    it('should NOT be possible to transfer tokens via transferFrom, if spent all alowance', async function() {
      const fee = 500n;
      const partFee = 250n;

      expect(await dgvc.getBurnFee()).to.equal(0);
      expect(await dgvc.getFee()).to.equal(0);
      await dgvc.setCommonFee(250);
      await dgvc.setBurnFee(250);
      expect(await dgvc.getBurnFee()).to.equal(partFee);
      expect(await dgvc.getFee()).to.equal(partFee);

      await dgvc.setFeeReceiver(feeReceiver.address);
      const amount = utils.parseUnits('100', baseUnit).toBigInt();
      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply);
      expect(await dgvc.balanceOf(user.address)).to.equal(0);
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(0);


      expect(await dgvc.getBurnCycle()).to.equal(0);

      expect(await dgvc.totalBurn()).to.equal(0);

      await dgvc.approve(userTwo.address, amount);
      await dgvc.connect(userTwo).transferFrom(owner.address, user.address, amount);


      expect(await dgvc.getBurnCycle()).to.equal(amount * fee / HUNDRED_PERCENT);
      expect(await dgvc.totalBurn()).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.balanceOf(owner.address)).to.equal(totalSupply - amount);
      expect(await dgvc.balanceOf(user.address)).to.equal(amount - (amount * fee / HUNDRED_PERCENT));
      expect(await dgvc.balanceOf(feeReceiver.address)).to.equal(amount * partFee / HUNDRED_PERCENT);

      expect(await dgvc.totalSupply()).to.equal(totalSupply - (amount * partFee / HUNDRED_PERCENT));

      await expect(dgvc.connect(userTwo).transferFrom(owner.address, user.address, amount)).to.revertedWith('transfer amount exceeds allowance');
    });


  });
