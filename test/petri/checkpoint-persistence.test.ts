import { PetriNet } from '../../petri/index';
import { CortexFlowOrchestrator } from '../../petri/orchestrator';
import { ToolRegistry } from '../../graph/registry';
import { InMemoryPetriCheckpointAdapter } from '../../petri/checkpoint-adapter';

async function testCheckpoint() {
  console.log('🚀 Testing Petri Checkpoint Persistence...\n');

  const toolRegistry = new ToolRegistry();
  const orchestrator = new CortexFlowOrchestrator('test_net', toolRegistry);

  // Setup Petri net
  const net = orchestrator.petri;
  net.addPlace({ id: 'idle', type: 'initial', tokens: [{ id: 'start', data: {}, createdAt: 0 }] });
  net.addPlace({ id: 'processing', type: 'normal', tokens: [] });
  net.addPlace({ id: 'done', type: 'final', tokens: [] });

  net.addTransition({ id: 'process', from: ['idle'], to: 'processing' });
  net.addTransition({ id: 'complete', from: ['processing'], to: 'done' });

  // Set checkpoint adapter
  const adapter = new InMemoryPetriCheckpointAdapter();
  orchestrator.setPetriCheckpointAdapter(adapter);

  // Start session
  const sessionId = orchestrator.startSession();
  console.log(`Session started: ${sessionId}`);

  // Save initial state
  const cpId1 = await orchestrator.savePetriState(sessionId);
  console.log(`✅ Checkpoint 1 saved: ${cpId1}`);

  // Fire a transition
  const result = await orchestrator.fire('process', sessionId);
  console.log(`✅ Transition "process" fired: ${result.success}`);
  console.log(`   Marking after fire: idle=${net.state.marking.get('idle')?.length}, processing=${net.state.marking.get('processing')?.length}`);

  // Save state after transition
  const cpId2 = await orchestrator.savePetriState(sessionId);
  console.log(`✅ Checkpoint 2 saved: ${cpId2}`);

  // List checkpoints
  const checkpoints = await orchestrator.listPetriCheckpoints();
  console.log(`✅ Found ${checkpoints.length} checkpoints`);

  // Restore from checkpoint 1 (initial state)
  const restoredSessionId = await orchestrator.restorePetriState(cpId1!);
  if (restoredSessionId) {
    const restoredSession = orchestrator.getSession(restoredSessionId);
    const restoredNet = restoredSession!.petriNet;
    console.log(`✅ Restored session: ${restoredSessionId}`);
    console.log(`   Marking after restore: idle=${restoredNet.state.marking.get('idle')?.length}, processing=${restoredNet.state.marking.get('processing')?.length}`);
  }

  console.log('\n✅ Petri Checkpoint Persistence test passed!\n');
}

testCheckpoint().catch(console.error);
