// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DataMarketplace {

    // =========================================================
    // ACCESS STATUS
    // =========================================================

    enum AccessStatus {
        NONE,
        PENDING,
        APPROVED,
        REJECTED,
        AUTHORIZED
    }


    // =========================================================
    // DATASET STRUCTURE
    // =========================================================

    struct Data {
        uint id;
        string name;
        string category;
        string description;
        uint price;
        address payable owner;

        // Phase 2 additions
        string ipfsCID;
        string dataHash;
    }


    // =========================================================
    // ACCESS REQUEST STRUCTURE
    // =========================================================

    struct AccessRequest {
        address requester;
        uint dataId;
        AccessStatus status;
    }


    uint public dataCount = 0;

    // Dataset ID → Dataset
    mapping(uint => Data) public dataList;

    // Dataset ID → Requester → Access Request
    mapping(uint => mapping(address => AccessRequest)) public accessRequests;


    // =========================================================
    // EVENTS
    // =========================================================

    event DataAdded(
        uint indexed dataId,
        address indexed owner,
        uint price
    );

    event AccessRequested(
        uint indexed dataId,
        address indexed requester
    );

    event AccessApproved(
        uint indexed dataId,
        address indexed requester
    );

    event AccessRejected(
        uint indexed dataId,
        address indexed requester
    );

    event DataPurchased(
        uint indexed dataId,
        address indexed buyer,
        address indexed owner,
        uint amount
    );

    event AccessAuthorized(
        uint indexed dataId,
        address indexed requester
    );


    // =========================================================
    // ADD DATA
    // =========================================================

    function addData(
        string memory _name,
        string memory _category,
        string memory _description,
        uint _price,
        string memory _ipfsCID,
        string memory _dataHash
    ) public {

        dataCount++;

        dataList[dataCount] = Data(
            dataCount,
            _name,
            _category,
            _description,
            _price,
            payable(msg.sender),
            _ipfsCID,
            _dataHash
        );

        emit DataAdded(
            dataCount,
            msg.sender,
            _price
        );
    }


    // =========================================================
    // REQUEST ACCESS
    // =========================================================

    function requestAccess(uint _id) public {

        require(
            _id > 0 && _id <= dataCount,
            "Dataset does not exist"
        );

        require(
            msg.sender != dataList[_id].owner,
            "Owner already has access"
        );

        require(
            accessRequests[_id][msg.sender].status != AccessStatus.PENDING,
            "Request already pending"
        );

        require(
            accessRequests[_id][msg.sender].status != AccessStatus.AUTHORIZED,
            "Access already authorized"
        );

        accessRequests[_id][msg.sender] = AccessRequest(
            msg.sender,
            _id,
            AccessStatus.PENDING
        );

        emit AccessRequested(
            _id,
            msg.sender
        );
    }


    // =========================================================
    // APPROVE ACCESS
    // =========================================================

    function approveAccess(
        uint _id,
        address _requester
    ) public {

        require(
            _id > 0 && _id <= dataCount,
            "Dataset does not exist"
        );

        require(
            msg.sender == dataList[_id].owner,
            "Only owner can approve"
        );

        require(
            accessRequests[_id][_requester].status == AccessStatus.PENDING,
            "No pending request"
        );

        accessRequests[_id][_requester].status =
            AccessStatus.APPROVED;

        emit AccessApproved(
            _id,
            _requester
        );
    }


    // =========================================================
    // REJECT ACCESS
    // =========================================================

    function rejectAccess(
        uint _id,
        address _requester
    ) public {

        require(
            _id > 0 && _id <= dataCount,
            "Dataset does not exist"
        );

        require(
            msg.sender == dataList[_id].owner,
            "Only owner can reject"
        );

        require(
            accessRequests[_id][_requester].status == AccessStatus.PENDING,
            "No pending request"
        );

        accessRequests[_id][_requester].status =
            AccessStatus.REJECTED;

        emit AccessRejected(
            _id,
            _requester
        );
    }


    // =========================================================
    // BUY DATA / PAYMENT
    // =========================================================

    function buyData(uint _id) public payable {

        require(
            _id > 0 && _id <= dataCount,
            "Dataset does not exist"
        );

        Data memory d = dataList[_id];

        require(
            accessRequests[_id][msg.sender].status ==
            AccessStatus.APPROVED,
            "Access not approved"
        );

        require(
            msg.value == d.price,
            "Incorrect ETH amount"
        );

        // Transfer payment to dataset owner
        d.owner.transfer(msg.value);

        // Authorize access after successful payment
        accessRequests[_id][msg.sender].status =
            AccessStatus.AUTHORIZED;

        emit DataPurchased(
            _id,
            msg.sender,
            d.owner,
            msg.value
        );

        emit AccessAuthorized(
            _id,
            msg.sender
        );
    }


    // =========================================================
    // GET DATA
    // =========================================================

    function getData(uint _id)
        public
        view
        returns (
            uint,
            string memory,
            string memory,
            string memory,
            uint,
            address,
            string memory,
            string memory
        )
    {
        require(
            _id > 0 && _id <= dataCount,
            "Dataset does not exist"
        );

        Data memory d = dataList[_id];

        return (
            d.id,
            d.name,
            d.category,
            d.description,
            d.price,
            d.owner,
            d.ipfsCID,
            d.dataHash
        );
    }


    // =========================================================
    // CHECK ACCESS
    // =========================================================

    function hasAccess(
        uint _id,
        address _user
    ) public view returns (bool) {

        return (
            accessRequests[_id][_user].status ==
            AccessStatus.AUTHORIZED
        );
    }


    // =========================================================
    // GET ACCESS STATUS
    // =========================================================

    function getAccessStatus(
        uint _id,
        address _user
    ) public view returns (AccessStatus) {

        return accessRequests[_id][_user].status;
    }
}