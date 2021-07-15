const Ganache = require('./helpers/ganache');
const { BigNumber, utils } = require('ethers');
const { expect, assert } = require('chai');

  describe('DGVC Recover Tokens', function() {
    const BNtoBigInt = (input) => BigInt(input.toString());
    const BigInttoBN = (input) => BigNumber.from(input.toString());

    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const ganache = new Ganache();
    const baseUnit = 18;
    const amount = utils.parseUnits('100', baseUnit).toBigInt();

    let accounts;
    let dgvc;
    let dgvc1;
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
      
      const DGVC = await ethers.getContractFactory('DGVC');
      dgvc = await DGVC.deploy(router);
      await dgvc.deployed();

      const DGVC1 = await ethers.getContractFactory('DegenVC1');
      dgvc1 = await DGVC1.deploy();

      await ganache.snapshot();
    });

    afterEach('revert', function() { return ganache.revert(); });

    it('should revert recoverTokens() if caller is not the owner', async function() {
      await expect(
        dgvc.connect(user).recoverTokens(dgvc1.address, userTwo.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert recoverTokens() in case of zero destination address', async function() {
        await expect(
          dgvc.recoverTokens(dgvc1.address , ZERO_ADDRESS)
        ).to.be.revertedWith('Zero address not allowed');
    });

    it('should be possible to recover tokens by owner', async function() {
        expect(await dgvc1.balanceOf(user.address)).to.be.equal(BigInttoBN(0));
        
        await dgvc1.transfer(dgvc.address, amount);

        dgvc.recoverTokens(dgvc1.address, user.address);

        expect(await dgvc1.balanceOf(user.address)).to.be.equal(BigInttoBN(amount));
    });

    it('should not be possible to recover tokens in case of 0 balance', async function() {
        expect(await dgvc1.balanceOf(user.address)).to.be.equal(BigInttoBN(0));

        dgvc.recoverTokens(dgvc1.address, user.address);

        expect(await dgvc1.balanceOf(user.address)).to.be.equal(BigInttoBN(0));
    });

    it('should be possible to recover DGVC tokens', async function() {
        expect(await dgvc.balanceOf(user.address)).to.be.equal(BigInttoBN(0));
        
        await dgvc.transfer(dgvc.address, amount);

        dgvc.recoverTokens(dgvc.address, user.address);

        expect(await dgvc.balanceOf(user.address)).to.be.equal(BigInttoBN(amount));
    });
});
