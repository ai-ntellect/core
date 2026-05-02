#!/usr/bin/env node

/**
 * Generate living documentation for CortexFlow Petri nets
 * Usage: npx ts-node scripts/generate-petri-docs.ts [petri-net.json] [output-dir]
 */

import { PetriNet } from '../petri/index';
import { PetriDocumentationGenerator } from '../petri/documentation-generator';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: npx ts-node scripts/generate-petri-docs.ts <petri-net.json> [output-dir]');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/generate-petri-docs.ts examples/my-net.json');
    console.log('  npx ts-node scripts/generate-petri-docs.ts examples/my-net.json ./docs');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputDir = args[1] || './docs/petri';

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`📖 Generating documentation for ${inputFile}...`);

  // Load Petri net from JSON
  const json = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  
  const net = new PetriNet(json.name || path.basename(inputFile, '.json'));
  
  // Add places
  for (const place of json.places || []) {
    net.addPlace(place);
  }
  
  // Add transitions
  for (const trans of json.transitions || []) {
    net.addTransition(trans);
  }

  // Generate documentation
  const generator = new PetriDocumentationGenerator();
  await generator.generateForPetri(net, {
    outputDir,
    format: 'all',  // Generate markdown + mermaid + html
    includeHistory: true,
    includeState: true,
  });

  console.log(`✅ Documentation generated in ${outputDir}`);
  console.log('');
  console.log('Generated files:');
  console.log(`  - ${outputDir}/${net.name}.md`);
  console.log(`  - ${outputDir}/${net.name}-diagram.mmd`);
  console.log(`  - ${outputDir}/${net.name}.html`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
