// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IDGVC.sol";

contract FeeDistributor is Ownable {
  struct FeeRecipient {
        address liquidVault;
        address secondaryAddress;
        uint256 liquidVaultShare; //percentage between 0 and 100
        uint256 burnPercentage;
    }
    
    IDGVC public dgvc;
    FeeRecipient public recipients;

    bool public initialized;

    uint private constant MINIMUM_AMOUNT = 1e8;

    modifier seeded {
        require(
            initialized,
            "FeeDistributor: Fees cannot be distributed until Distributor seeded."
        );
        _;
    }

    function seed(
        address _dgvc,
        address _vault,
        address _secondaryAddress,
        uint _liquidVaultShare,
        uint _burnPercentage
    ) external onlyOwner {
        require(
            _liquidVaultShare + _burnPercentage <= 100,
            "FeeDistributor: liquidVault + burnPercentage incorrect sets"
        );
        dgvc = IDGVC(_dgvc);
        recipients.liquidVault = _vault;
        recipients.secondaryAddress = _secondaryAddress;
        recipients.liquidVaultShare = _liquidVaultShare;
        recipients.burnPercentage = _burnPercentage;
        initialized = true;
    }

    function distributeFees() external seeded {
        uint balance = dgvc.balanceOf(address(this));

        if (balance < MINIMUM_AMOUNT) {
            return;
        }

        uint liquidShare;
        uint burningShare;
        uint secondaryShare;

        if (recipients.liquidVaultShare > 0) {
            liquidShare = recipients.liquidVaultShare * balance / 100;

            require(
                dgvc.transfer(recipients.liquidVault, liquidShare),
                "FeeDistributor: transfer to LiquidVault failed"
            );
        }

        if (recipients.burnPercentage > 0) {
            burningShare = recipients.burnPercentage * balance / 100;
            dgvc.burn(burningShare);
        }

        secondaryShare = balance - liquidShare - burningShare;
        if (secondaryShare > 0) {
            require(
            dgvc.transfer(recipients.secondaryAddress, secondaryShare),
            "FeeDistributor: transfer to the secondary address failed"
        );
        }
    }
}

