// import { expect } from "chai";
// import { Summarizer } from "../../llm/synthesizer";

// describe("Synthesizer", () => {
//   let synthesizer: Summarizer;

//   beforeEach(() => {
//     synthesizer = new Summarizer();
//   });

//   it("should process results and return a summary", async function () {
//     this.timeout(10000);

//     const mockResults = JSON.stringify({
//       result: [
//         {
//           name: "prepare-transaction",
//           result: {
//             to: "0x123...456",
//             value: "0.1",
//             chain: { id: 1, name: "ethereum" },
//           },
//         },
//       ],
//       initialPrompt: "Send 0.1 ETH to 0x123...456 on ethereum",
//     });

//     const result = await synthesizer.process(mockResults);
//     expect(result).to.have.property("response").that.is.a("string");
//   });
// });
