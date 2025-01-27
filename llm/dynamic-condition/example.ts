import { deepseek } from "@ai-sdk/deepseek";
import { configDotenv } from "dotenv";
import { DynamicConditionGenerator } from "./index";

const schema = `{
  "type": "object",
  "properties": {
    "volume": { "type": "number" }
  },
  "required": ["volume"]
}`;

const testData = {
  volume: 100000,
};

configDotenv();

async function example() {
  const generator = new DynamicConditionGenerator(
    deepseek("deepseek-reasoner")
  );

  const result = await generator.generateCondition(
    schema,
    "check all pools with more than 100k volume",
    {
      functionName: "tradingCondition",
      testData,
    }
  );

  console.log("Generated function:", result);
}

example();
