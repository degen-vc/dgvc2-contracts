const Ganache = require('./helpers/ganache');
const { expect } = require('chai');

describe('Swap', function() {
  const TRANSFER_AMOUNT = utils.parseUnits('10000').toBigInt();

  const ganache = new Ganache();

  let accounts;
  let owner;
  let user;

  let swap;
  let dgvc;
  let dgvc2;

  beforeEach('setup', async function() {
    accounts = await ethers.getSigners();
    owner = accounts[0];
    user = accounts[1];

    afterEach('revert', function() { return ganache.revert(); });

    const DGVC = await ethers.getContractFactory('DegenVC1');
    
    dgvc = await DGVC.deploy();
    dgvc2 = await DGVC.deploy();

    const Swap = await ethers.getContractFactory('Swap');
    swap = await Swap.deploy(dgvc.address, dgvc2.address);

    await ganache.snapshot();
  });

  it('should revert swap if balance is 0', async function() {
    expect(await dgvc.balanceOf(user.address)).to.equal(0);
    await expect(swap.connect(user).swap()).to.be.revertedWith('Nothing to swap');
  });

  it('should revert swap if not enough DGVC2 on the balance', async function() {
    await expect(swap.swap()).to.be.revertedWith('Not enough DGVC2 on swap contract');
  });

  it('should revert swap if transfer exceeds allowance', async function() {
    await dgvc2.transfer(swap.address, TRANSFER_AMOUNT);
    await dgvc.transfer(user.address, TRANSFER_AMOUNT);

    expect(await dgvc2.balanceOf(swap.address)).to.equal(TRANSFER_AMOUNT);

    await expect(swap.connect(user).swap()).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
  });

  it('should swap DGVC2 for DGVC', async function() {
    await dgvc2.transfer(swap.address, TRANSFER_AMOUNT);
    await dgvc.transfer(user.address, TRANSFER_AMOUNT);
    await dgvc.connect(user).approve(swap.address, TRANSFER_AMOUNT);

    expect(await dgvc2.balanceOf(swap.address)).to.equal(TRANSFER_AMOUNT);

    await swap.connect(user).swap();

    expect(await dgvc2.balanceOf(user.address)).to.equal(TRANSFER_AMOUNT);
  });
});