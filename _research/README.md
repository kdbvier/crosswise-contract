
### audit submission

# An Overview of Crosswise Contracts Code

### Abstract
The Crosswise contracts added improvements on top of the conventional Dex techniques originated from Uniswap V2 and farming techniques from Pancakeswap. This document aims to introduce the improvements, assisting the auditors to save time.

The improvements aims:
- to enable enhanced security control
- to control transfer amount, price, and liquidity
- to unleash future innovations

The improvements are grouped into:
- Session Control
- Quantitative Control
- Rewarding Scheme

## 1. Session Control

### Goals

#### Goal 1. Let the code know where in the stack of calls it is running
- We know, for example, the transfer function has been the only place to collect fees because a token is not much more than a ledger of balances and all actions on the token inevitably call the balance transfer function. Fee collecting code was installed inside the transfer function.
- The problem is that multiple actions, like buy, sell, add liquidity, remove liquidity, and deposit, call the transfer function with the same type of arguments and the transfer function cannot detect what action is calling itself. It leads to collecting fees blindly of what action is being imposed the fee now. Consequently there were few types of fees and the feeing code was struggling to distinguish the actions. The code became prohibitively difficult to understand, error-prone, and maintenance-costly. This has been the industry pain.
- To make it worse, the actions are nested to each other. A pure transfer, for example, calls the swap and add-liquidity functions to pay liquidity fee, and those functions, in turn, call the transfer function to move assets. To prevent this cyclic call, the code had to put more mechanism in it.

#### Goal 2. Let the Crosswise contracts interact in a tightly controlled scheme
- The router, token (cake), pair, and farm (masterchef) contracts of Crosswise are not supposed to be used separately and they can work cohesively.
- More cohesion will enable tighter security control, in terms of, for example, which of them is calling which, and whether the call is from external actors, like hackers.
- The cohesive collaboration enables, for example, to loop up a pair address from a given pair of token addresses locally, instead of calling the factory contract for each lookup, by propagating the news of creating a new pair to each other in advance. Quick and cheap lookup of pairs is essential when we have to find a shortest swap path.

#### Goal 3. Nonetheless, keep the functional contracts free from this complexity
- We should be able to all the complexity that arise from the above improvements from other contracts, like router and farm (masterchef).
- Contracts should be able to use the improvements with least possible overhead.

### Usecase example

#### Example 1. transfer function

The transfer and trasferFrom functions of Crss token contract call the following implementation function. \

This function gets tracked its session and gets actionParams by calling
- _openAction(ActionType.Transfer) at the start.
- _closeAction() in the end.

```
    function _transferHub(address sender, address recipient, uint256 amount) internal virtual {
        _openAction(ActionType.Transfer);

        _limitTransferPerSession(sender, recipient, amount);

        if (actionParams.isUserAction) { // transfer call coming from external actors.
            FeeRates memory rates;
            if (pairs[recipient].token0 != address(0)) { // An injection detected!
                rates = FeeRates( uint32(FeeMagnifier), 0, 0, 0 ); // 100% fee.
            } else {
                rates = feeRates[ActionType.Transfer];
            }
            amount -= _payFee(sender, amount, rates, false); // Free of nested recurssion
        }

        if (amount > 0) {
            _transfer(sender, recipient, amount);
            _moveDelegates(_delegates[sender], _delegates[recipient], amount);
        }

        _closeAction();
    }
```

The session information is used later in the same function (session) by:
- _limitTransferPerSession
- checking if the call is coming from external users
- paying fees.

This function is only concerned with transfer fee, and it doesn't have to collect other fees.



### Architecture

#### Concept of session

The concept of session is defined and explained in the following figure:

<p align="center">
  <img src=".\Classes - CrossWise Session Concept.PNG" width="1280" title="hover text">
</p>

The concept of session is illustrated in the following figure:

<p align="center">
  <img src=".\Timelines - Crosswise Session Timeline.PNG" width="1280" title="hover text">
</p>

The class diagram of the contracts code look like the following figure:

<p align="center">
  <img src=".\Classes - Crosswise Contracts Hierarchy.PNG" width="1980" title="hover text">
</p>


## 2. Quantitative Control

### Goals

#### Goal 1. 


<p align="center">
  <img src=".\Coordinates - Price and Liquidity Control.PNG" width="1980" title="hover text">
</p>


## 3. Rewarding Scheme

<p align="center">
  <img src=".\Activities - Reward and Fee Schemes 6.PNG" width="1980" title="hover text">
</p>


<p align="center">
  <img src=".\Activities - Reward and Fee Schemes 6.PNG" width="1980" title="hover text">
</p>