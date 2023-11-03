<div align="center">
  <img border-radius="25px" max-height="250px" src="./banner.png" />
  <h1>Hardhat+Tenderly Stack</h1>
  <p>
    <strong>by <a href="https://astrolab.fi">Astrolab<a></strong>
  </p>
  <p>
    <!-- <a href="https://github.com/AstrolabFinance/hardhat/actions"><img alt="Build Status" src="https://github.com/AstrolabFinance/hardhat/actions/workflows/tests.yaml/badge.svg" /></a> -->
    <a href="https://opensource.org/licenses/MIT"><img alt="License" src="https://img.shields.io/github/license/AstrolabFinance/hardhat?color=3AB2FF" /></a>
    <a href="https://discord.gg/PtAkTCwueu"><img alt="Discord Chat" src="https://img.shields.io/discord/984518964371673140"/></a>
    <a href="https://docs.astrolab.fi"><img alt="Astrolab Docs" src="https://img.shields.io/badge/astrolab_docs-F9C3B3" /></a>
  </p>
</div>

This repository serves as Astrolab's foundational setup for smart contract development.
It embed [Hardhat](https://github.com/NomicFoundation/hardhat) enriched with [blockchains metadata](./_networks.json) supplemented by [Tenderly's plugin](https://github.com/Tenderly/hardhat-tenderly).
cf. [hardhat base configuration](./hardhat.config.ts)
It enables easy bootstraping of any web3 back-end and/or smart contract development project by minimizing the necessity of boilerplate code.

Astrolab utilizes this setup across most its contract and blockchain SDK repositories.

Example TS Usage:

```typescript
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@tenderly/hardhat-tenderly";
import { config, tenderly } from "@astrolabs/hardhat/dist/hardhat.config";

tenderly.setup({ automaticVerifications: false });
config.paths = {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test/integration"
};

export default config;
```

Example JS Usage:
```javascript
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("@tenderly/hardhat-tenderly");
const { config, tenderly } = require("@astrolabs/hardhat/dist/hardhat.config");

tenderly.setup({ automaticVerifications: false });
config.paths = {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test/integration"
};

module.exports = config;
```

## Contributions
Contributions to improve this setup are highly welcomed. Feel free to submit issues or pull requests to enhance the functionality and usability of this repository.
