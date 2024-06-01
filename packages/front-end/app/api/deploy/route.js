import { NextResponse } from "next/server";
import { SUPPORTED_CHAINS } from "./../../constants";

import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export async function POST(request) {
  try {
    const body = await request.json();
    const { chainName, contract, constructorArguments } = body;

    if (!chainName || !contract) {
      return NextResponse.json(
        { message: "Missing chainName or contract parameter" },
        { status: 400 }
      );
    }
    if (!SUPPORTED_CHAINS.map((chain) => chain.name).includes(chainName)) {
      return NextResponse.json(
        { message: "Unsupported chain" },
        { status: 400 }
      );
    }
    let chain;
    for (const _chain of SUPPORTED_CHAINS) {
      if (_chain.name === chainName) {
        chain = _chain;
      }
    }

    // Compile
    var solc = require("solc");
    var compilerInput = {
      language: "Solidity",
      sources: {
        source: {
          content: contract,
        },
      },
      settings: {
        outputSelection: {
          "*": {
            "*": ["*"],
          },
        },
      },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
    if (Object.keys(output.contracts.source).length === 0) {
      return NextResponse.json(
        { message: "Error while compiling" },
        { status: 500 }
      );
    }
    const bytecode =
      output.contracts.source[Object.keys(output.contracts.source)[0]].evm
        .bytecode.object;
    const abi =
      output.contracts.source[Object.keys(output.contracts.source)[0]].abi;

    // Init Wallet client
    const account = privateKeyToAccount(process.env.BE_ACCOUNT_PK);
    const client = createWalletClient({
      account,
      chain: chain,
      transport: http(),
    }).extend(publicActions);

    // Deploy
    const hash = await client.deployContract({
      abi,
      bytecode: bytecode,
      args: constructorArguments,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      return NextResponse.json(
        { message: "Error when broadcasting deployment transaction" },
        { status: 400 }
      );
    }

    // If chain has block explorer generate link
    let linkToBlockExplorer = hash;
    if ("blockExplorers" in chain) {
      linkToBlockExplorer = `${chain.blockExplorers.default.url}/tx/${hash}`;
    }
    console.log(receipt);

    return NextResponse.json(
      {
        message: "Contract deployed successfully",
        data: {
          hash: hash,
          linkToBlockExplorer: linkToBlockExplorer,
          abi: abi,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Error while generating", error: error.message },
      { status: 500 }
    );
  }
}
