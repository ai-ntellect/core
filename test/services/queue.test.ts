// import { expect } from "chai";
// import { z } from "zod";
// import { ActionQueueManager } from "../../services/queue";
// import { ActionSchema } from "../../types";

// describe("ActionQueueManager", () => {
//   let queueManager: ActionQueueManager;

//   const mockAction: ActionSchema = {
//     name: "prepare-transaction",
//     description: "Prepare a transfer transaction",
//     parameters: z.object({
//       walletAddress: z.string(),
//       amount: z.string(),
//       networkId: z.string(),
//     }),
//     execute: async ({ walletAddress, amount, networkId }) => {
//       return { walletAddress, amount, networkId };
//     },
//   };

//   beforeEach(() => {
//     queueManager = new ActionQueueManager([mockAction]);
//   });

//   it("should process queue items correctly", async () => {
//     const queueItem = {
//       name: "prepare-transaction",
//       parameters: [
//         { name: "walletAddress", value: "0x123...456" },
//         { name: "amount", value: "0.1" },
//         { name: "networkId", value: "1" },
//       ],
//     };

//     queueManager.addToQueue([queueItem]);
//     const results = await queueManager.processQueue();

//     expect(results).to.exist;
//     expect(results!).to.be.an("array");
//     expect(results![0]).to.have.property("name", "prepare-transaction");
//     expect(results![0]).to.have.property("result").that.is.an("object");
//   });
// });
