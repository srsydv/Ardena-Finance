// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.24;

// contract MockERC20 {
//     string public name;
//     string public symbol;
//     uint8 public immutable decimals;
//     uint256 public totalSupply;
//     mapping(address => uint256) public balanceOf;
//     mapping(address => mapping(address => uint256)) public allowance;

//     constructor(string memory n, string memory s, uint8 d) {
//         name = n; symbol = s; decimals = d;
//     }

//     event Transfer(address indexed from, address indexed to, uint256 amount);
//     event Approval(address indexed owner, address indexed spender, uint256 amount);

//     function approve(address sp, uint256 amt) external returns (bool) {
//         allowance[msg.sender][sp] = amt;
//         emit Approval(msg.sender, sp, amt);
//         return true;
//     }

//     function transfer(address to, uint256 amt) external returns (bool) {
//         _transfer(msg.sender, to, amt);
//         return true;
//     }

//     function transferFrom(address from, address to, uint256 amt) external returns (bool) {
//         uint256 a = allowance[from][msg.sender];
//         require(a >= amt, "ALLOW");
//         if (a != type(uint256).max) allowance[from][msg.sender] = a - amt;
//         _transfer(from, to, amt);
//         return true;
//     }

//     function mint(address to, uint256 amt) external {
//         totalSupply += amt;
//         balanceOf[to] += amt;
//         emit Transfer(address(0), to, amt);
//     }

//     function _transfer(address from, address to, uint256 amt) internal {
//         require(balanceOf[from] >= amt, "BAL");
//         balanceOf[from] -= amt;
//         balanceOf[to] += amt;
//         emit Transfer(from, to, amt);
//     }
// }
