// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LumexaWalletAssistant {
    uint256 public constant MAX_PROMPT_LENGTH = 280;
    uint256 public constant MAX_RESPONSE_LENGTH = 560;

    address public immutable deployer;
    string public assistantName;
    uint256 public interactionCount;

    struct Interaction {
        address user;
        string prompt;
        string response;
        uint64 createdAt;
    }

    mapping(uint256 => Interaction) private interactions;
    mapping(address => uint256[]) private userInteractionIds;

    event InteractionLogged(
        uint256 indexed interactionId,
        address indexed user,
        string prompt,
        string response
    );

    constructor(string memory initialAssistantName) {
        require(bytes(initialAssistantName).length > 0, "Assistant name required");

        deployer = msg.sender;
        assistantName = initialAssistantName;
    }

    function logInteraction(
        string calldata prompt,
        string calldata response
    ) external returns (uint256 interactionId) {
        bytes memory promptBytes = bytes(prompt);
        bytes memory responseBytes = bytes(response);

        require(promptBytes.length > 0, "Prompt required");
        require(responseBytes.length > 0, "Response required");
        require(
            promptBytes.length <= MAX_PROMPT_LENGTH,
            "Prompt too long"
        );
        require(
            responseBytes.length <= MAX_RESPONSE_LENGTH,
            "Response too long"
        );

        interactionId = interactionCount;

        interactions[interactionId] = Interaction({
            user: msg.sender,
            prompt: prompt,
            response: response,
            createdAt: uint64(block.timestamp)
        });

        userInteractionIds[msg.sender].push(interactionId);
        interactionCount = interactionId + 1;

        emit InteractionLogged(interactionId, msg.sender, prompt, response);
    }

    function getInteraction(
        uint256 interactionId
    )
        external
        view
        returns (
            address user,
            string memory prompt,
            string memory response,
            uint64 createdAt
        )
    {
        Interaction storage interaction = interactions[interactionId];

        return (
            interaction.user,
            interaction.prompt,
            interaction.response,
            interaction.createdAt
        );
    }

    function getLatestInteractionForUser(
        address user
    )
        external
        view
        returns (
            bool found,
            uint256 interactionId,
            address interactionUser,
            string memory prompt,
            string memory response,
            uint64 createdAt
        )
    {
        uint256 totalUserInteractions = userInteractionIds[user].length;

        if (totalUserInteractions == 0) {
            return (false, 0, address(0), "", "", 0);
        }

        interactionId = userInteractionIds[user][totalUserInteractions - 1];
        Interaction storage interaction = interactions[interactionId];

        return (
            true,
            interactionId,
            interaction.user,
            interaction.prompt,
            interaction.response,
            interaction.createdAt
        );
    }

    function getUserInteractionIds(
        address user
    ) external view returns (uint256[] memory) {
        return userInteractionIds[user];
    }
}
