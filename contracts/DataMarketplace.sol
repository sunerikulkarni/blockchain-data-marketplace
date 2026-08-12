// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DataMarketplace {

    struct Data {
    uint id;
    string name;
    string category;
    string description;
    uint price;
    address payable owner;
}

    uint public dataCount = 0;
    mapping(uint => Data) public dataList;

    // Add data
    function addData(
    string memory _name,
    string memory _category,
    string memory _description,
    uint _price
) public {
    dataCount++;
    dataList[dataCount] = Data(
        dataCount,
        _name,
        _category,
        _description,
        _price,
        payable(msg.sender)
    );
}

    // Buy data
    function buyData(uint _id) public payable {
        Data memory d = dataList[_id];

        require(msg.value >= d.price, "Not enough ETH");

        d.owner.transfer(msg.value);
    }

    // Get data
    function getData(uint _id) public view returns (string memory, uint, address) {
        Data memory d = dataList[_id];
        return (d.name, d.price, d.owner);
    }
}