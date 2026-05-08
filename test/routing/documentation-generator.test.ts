import { expect } from 'chai';
import { PetriNet, Place, Transition } from '../../routing/index';
import { PetriDocumentationGenerator } from '../../routing/documentation-generator';

describe('Petri Documentation Generator', () => {
  let net: PetriNet;
  let generator: PetriDocumentationGenerator;

  beforeEach(() => {
    net = new PetriNet('test-doc-net');
    
    const idlePlace: Place = { id: 'idle', type: 'initial', tokens: [] };
    const processingPlace: Place = { id: 'processing', type: 'normal', tokens: [] };
    const donePlace: Place = { id: 'done', type: 'final', tokens: [] };
    
    net.addPlace(idlePlace);
    net.addPlace(processingPlace);
    net.addPlace(donePlace);
    
    const startTrans: Transition = { 
      id: 'start', 
      from: ['idle'], 
      to: ['processing'], 
      description: 'Start processing' 
    };
    const completeTrans: Transition = { 
      id: 'complete', 
      from: ['processing'], 
      to: ['done'], 
      description: 'Complete task' 
    };
    
    net.addTransition(startTrans);
    net.addTransition(completeTrans);
    
    // Use internal state to add tokens
    const marking = (net as any).state.marking as Map<string, any[]>;
    marking.set('idle', [{ id: 't1', data: { task: 'test' }, createdAt: Date.now() }]);

    generator = new PetriDocumentationGenerator();
  });

  it('should generate Mermaid diagram via public generateForPetri', async () => {
    const outputDir = '/tmp/test-doc';
    await generator.generateForPetri(net, { outputDir, format: 'markdown' });
    
    // Read generated file
    const fs = require('fs');
    const files = fs.readdirSync(outputDir);
    
    expect(files).to.include('test-doc-net.md');
    expect(files).to.include('test-doc-net-diagram.mmd');
    
    const markdown = fs.readFileSync(`${outputDir}/test-doc-net.md`, 'utf8');
    expect(markdown).to.include('# Petri Net: test-doc-net');
    expect(markdown).to.include('Start processing');
    
    const mermaid = fs.readFileSync(`${outputDir}/test-doc-net-diagram.mmd`, 'utf8');
    expect(mermaid).to.include('graph TD');
    expect(mermaid).to.include('idle((idle');
  });

  it('should generate HTML when format is all', async () => {
    const outputDir = '/tmp/test-doc-html';
    await generator.generateForPetri(net, { outputDir, format: 'all' });
    
    const fs = require('fs');
    const files = fs.readdirSync(outputDir);
    
    expect(files).to.include('test-doc-net.html');
    
    const html = fs.readFileSync(`${outputDir}/test-doc-net.html`, 'utf8');
    expect(html).to.include('<!DOCTYPE html>');
    expect(html).to.include('mermaid.initialize');
  });
});
