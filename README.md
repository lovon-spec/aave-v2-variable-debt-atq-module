# Aave V2 Variable Debt ATQ module

One fixed contract category: Aave V2 non-transferable variable-debt accounting tokens for historical variable-rate borrowing balances and accrued interest. They are not transferable underlying assets.

The module supports Ethereum (chain `1`, Core and AMM markets) and Polygon (chain `137`). It does not return other accounting roles, reserve assets, LendingPools, configurators or providers. Ethereum Core and AMM names are explicitly separated even when two reserves share an underlying asset.

Aave V2 is a legacy protocol. The module includes frozen, paused, inactive and zero-supply historical reserves: excluding them would hide deployed accounting contracts. Its notes do not claim new borrowing is enabled, that balances remain outstanding, that an underlying maintains its peg, or that a bridge/issuer service remains available. No active-market, balance or supply filter is used.

## Published data sources

The pinned deployments were selected from the [official Aave protocol-subgraphs documentation](https://github.com/aave/protocol-subgraphs/blob/85dae6bde68229efe9c9555046fd5bbd336782c9/README.md), using the latest published deployments of the two named Aave V2 subgraphs at preparation time. The deployment CID is fixed in the source; contract addresses are not fixed output entries.

| Chain | Official subgraph ID | Deployment CID |
| --- | --- | --- |
| Ethereum 1 | `8wR23o1zkS4gpLqLNU4kG3JHYVucqGyopL5utGxP2q1N` | `QmdEuhCPTFx5q1Vf7jPQDVGQDpC34KYry82yb3NPc9sK6a` |
| Polygon 137 | `H1Et77RZh3XEf27vkAmJyzgCME2RSFLtDS2f4PPW6CGp` | `QmNfojj4Wu1DErB9iC6epPZc4K2zQCrm4KJUra3DMQqSNm` |

The query uses the V2 `reserves` schema and only its `vToken.id` relation for output addresses. Every reserve must have a nonzero underlying and selected-role contract, a recognized provider and matching LendingPool, and the composite reserve identity `underlyingAsset + provider`. The Aave V2 [vToken implementation](https://github.com/aave/protocol-v2/blob/ce53c4a8c8620125063168620eba0a8a92854eb8/contracts/protocol/tokenization/VariableDebtToken.sol) documents this token's role.

Markets and underlying metadata can also be cross-referenced in Aave's pinned address book: [Ethereum Core](https://github.com/aave-dao/aave-address-book/blob/f2a512e360d20a2d15214b6f63b9779a25c0d95e/src/AaveV2Ethereum.sol), [Ethereum AMM](https://github.com/aave-dao/aave-address-book/blob/f2a512e360d20a2d15214b6f63b9779a25c0d95e/src/AaveV2EthereumAMM.sol), and [Polygon](https://github.com/aave-dao/aave-address-book/blob/f2a512e360d20a2d15214b6f63b9779a25c0d95e/src/AaveV2Polygon.sol). The module reads the selected accounting-token addresses dynamically, including legacy reserves omitted from the current address book.

## Naming and attribution

Names have the form `V2 Core <asset> Variable Debt`, `V2 AMM <asset> Variable Debt`, or `V2 Polygon <asset> Variable Debt`. The `Amm` prefix is removed only in the AMM market. Names are plain text, at most 50 characters, and any case-insensitive collision after sanitization or truncation makes the entire call fail.

The project field is Aave. Notes additionally identify related underlying-token projects or historical LP protocols. Descriptive symbol-to-project metadata is not an output address list. Uniswap V2 and Balancer LP labels retain the indexed constituent labels; they are not recursively relabeled as current assets. The two exact historical G-UNI underlyings use the current Arrakis V1 protocol name while preserving Gelato and Uniswap V3 attribution. Aave's [executed G-UNI AMM proposal](https://governance-v2.aave.com/governance/proposal/51/) describes the original wrappers, and Arrakis's [V1/V2 deprecation notice](https://arrakis.finance/blog/v1-v2-deprecation) explicitly identifies Arrakis V1 as formerly G-UNI and deprecated, not the current Arrakis Modular protocol.

Only the following exact chain-and-underlying addresses receive identity corrections; the returned accounting-token addresses are never replaced:

- Polygon `0x2791bca1f2de4661ed88a30c99a7a9449aa84174`: Bridged USDC (Polygon PoS), USDC.e, retaining indexed USD Coin (PoS)/USDC. [Circle's announcement](https://www.circle.com/blog/what-you-need-to-know-native-usdc-on-polygon-pos) binds this exact bridged contract and distinguishes native Polygon USDC.
- Ethereum `0x853d955acef822db058eb8505911ed77f175b99e`: Legacy Frax Dollar (FRAX), retaining indexed Frax/FRAX. [The Frax Core Team's current naming status](https://gov.frax.finance/t/fip-441-frax-1-token-1-mission-1-vision/3826) distinguishes this legacy stablecoin from the newer FRAX governance/gas token. This does not replace the reserve with frxUSD.
- Ethereum `0x8e870d67f660d95d5be530380d0ec0bd388289e1`: Pax Dollar (USDP), preserving indexed Paxos Standard/PAX history. [Paxos's pinned contract documentation](https://github.com/paxosglobal/usdp-contracts/blob/1af2c7f0732e43ee1a331af106aa81f8a4c6476c/README.md) binds this proxy address.
- Ethereum `0xdd974d5c2e2928dea5f71b9825b8b646686bd200`: Kyber Network Crystal Legacy (KNCL), not the replacement KNC contract. [Kyber's pinned address documentation](https://github.com/KyberNetwork/kyberswap-documentation/blob/10d36ae2f7ab1a6626b4f71216b7b9020733156a/governance/knc-token/knc-contract-addresses.md) identifies the old token.
- Ethereum `0xa693b19d2931d498c5b318df961919bb4aee87a5`: TerraClassicUSD (Wormhole), USTC, preserving indexed UST (Wormhole) history. This descriptive identity follows the archived [Wormhole source-to-address mapping](https://github.com/wormhole-foundation/wormhole-token-list/blob/31d6cbc6e072d03731d7cd43997d0363b5339809/content/by_source.csv) for original Terra `uusd`, combined with Terra's [original-chain migration naming guide](https://docs.terra.money/migration/exchange-migration/). It does not assert a new wrapped contract, redeemability, a stable peg or present bridge support.
- Ethereum `0x50379f632ca68d36e50cfbc8f78fe16bd1499d1e` and `0xd2eec91055f07fe24c9ccb25828ecfefd4be0c41`: Arrakis V1 DAI/USDC and USDC/USDT, respectively, formerly G-UNI. The pinned Aave AMM address book binds each exact underlying to its historical constituent pair; the Arrakis notice above binds the protocol rebrand. Neither constituent token identity is changed, and indexed G-UNI names are retained in notes.
- Polygon `0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270`: Wrapped POL (WPOL), retaining the old Wrapped Matic/WMATIC indexed name. Aave's Polygon address book above binds the exact WPOL underlying.
- Polygon `0xc2132d05d31c914a87c6611c10748aeb04b58e8f`: USDT0, retaining indexed (PoS) Tether USD/USDT history and naming Tether, USDT0 and LayerZero. The [official USDT0 deployment table](https://docs.usdt0.to/technical-documentation/deployments) and Aave's Polygon address book identify the exact Polygon contract; this does not relabel Ethereum USDT or LP constituent tokens.

All indexed historical metadata is retained in the public note when an exact identity correction changes it. A ticker by itself never triggers these corrections.

## Retrieval and failure behavior

`returnTags(chainId: string, apiKey: string)` retrieves data only from the two fixed Graph deployment endpoints, using `node-fetch`. The supplied API key is used as a bearer credential, never embedded in a URL or returned output. No environment variables or other credential files are accessed by the module.

The initial indexed block hash pins every subsequent page. Pagination uses `first: 1000`, ascending composite reserve IDs and an `id_gt` cursor. Deployment, indexing-health and block consistency are checked on every page. Missing/invalid data, query errors, an unknown market, a conflicting accounting-token association, stalled pagination or an ambiguous name throws instead of returning a partial list. Errors do not reflect arbitrary provider messages. Each request is bounded to 30 seconds and the whole operation to three minutes.

## Build and tests

Use the lockfile and Yarn; the module has no runtime side effects besides read-only Graph retrieval.

```sh
yarn install --frozen-lockfile --ignore-scripts
yarn test
```

The single policy entrypoint is `src/main.mts`; the build produces `dist/main.mjs`. Tests use synthetic Graph responses to exercise the fixed role, both chains, market separation, hash-pinned pagination, malformed/incomplete responses, metadata corrections and fail-closed name handling.
