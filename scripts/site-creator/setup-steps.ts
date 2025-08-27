import { join } from 'path';
import { exists, writeJsonFile, readJsonFile } from '../utils/file-operations.js';
import { printInfo, printSuccess, printWarning, printError } from '../utils/logging.js';
import type { SetupStep, SetupProgress, StepStatus } from './types.js';

// Setup step definitions
export const SETUP_STEPS: Omit<SetupStep, 'status' | 'completedAt'>[] = [
  {
    id: 'generate-site-files',
    displayName: 'Generate initial site files',
    description: 'Create the core site structure and configuration',
    optional: false
  },
  {
    id: 'run-locally',
    displayName: 'Run React site locally',
    description: 'Verify your local development environment works',
    optional: false
  },
  {
    id: 'first-transcriptions',
    displayName: 'Generate first episode transcriptions',
    description: 'Process a few episodes locally to test the workflow',
    optional: false
  },
  {
    id: 'custom-icons',
    displayName: 'Setup custom icons',
    description: 'Customize your site branding and visual identity',
    optional: true
  },
  {
    id: 'custom-styling',
    displayName: 'Setup custom CSS & styling',
    description: 'Customize your site theme and appearance',
    optional: true
  },
  {
    id: 'complete-transcriptions',
    displayName: 'Complete all episode transcriptions',
    description: 'Process your full podcast archive',
    optional: false
  },
  {
    id: 'aws-deployment',
    displayName: 'Setup AWS deployment',
    description: 'Deploy your site to production (recommended)',
    optional: true
  },
  {
    id: 'local-automation',
    displayName: 'Setup local automation',
    description: 'Automate future episode processing (recommended)',
    optional: true
  }
];

// Progress management functions
function getProgressFilePath(siteId: string): string {
  return join('sites/my-sites', siteId, '.setup-progress.json');
}

export async function loadProgress(siteId: string): Promise<SetupProgress | null> {
  const progressPath = getProgressFilePath(siteId);
  if (!(await exists(progressPath))) {
    return null;
  }
  
  try {
    return await readJsonFile<SetupProgress>(progressPath);
  } catch {
    printWarning(`Could not load progress file for ${siteId}`);
    return null;
  }
}

export async function saveProgress(progress: SetupProgress): Promise<void> {
  const progressPath = getProgressFilePath(progress.siteId);
  progress.lastUpdated = new Date().toISOString();
  await writeJsonFile(progressPath, progress, { spaces: 2 });
}

export function createInitialProgress(siteId: string, podcastName: string): SetupProgress {
  const now = new Date().toISOString();
  const steps: Record<string, SetupStep> = {};
  
  SETUP_STEPS.forEach(stepDef => {
    steps[stepDef.id] = {
      ...stepDef,
      status: 'NOT_STARTED'
    };
  });
  
  return {
    siteId,
    podcastName,
    createdAt: now,
    lastUpdated: now,
    steps
  };
}

export async function updateStepStatus(siteId: string, stepId: string, status: StepStatus): Promise<void> {
  const progress = await loadProgress(siteId);
  if (!progress) {
    printError(`Could not find progress for site: ${siteId}`);
    return;
  }
  
  // Create step if it doesn't exist (for newly added steps)
  if (!progress.steps[stepId]) {
    const stepDef = SETUP_STEPS.find(s => s.id === stepId);
    if (stepDef) {
      progress.steps[stepId] = {
        ...stepDef,
        status: 'NOT_STARTED'
      };
    }
  }
  
  if (progress.steps[stepId]) {
    const oldStatus = progress.steps[stepId].status;
    progress.steps[stepId].status = status;
    if (status === 'COMPLETED') {
      progress.steps[stepId].completedAt = new Date().toISOString();
    }
    await saveProgress(progress);
    
    // Show progress update
    displayProgressUpdate(progress, stepId, oldStatus, status);
  }
}

export function calculateProgress(progress: SetupProgress): { completed: number; total: number; percentage: number } {
  // Use SETUP_STEPS as the source of truth for total steps
  const total = SETUP_STEPS.length;
  const completed = SETUP_STEPS.filter(stepDef => {
    const step = progress.steps[stepDef.id];
    return step?.status === 'COMPLETED';
  }).length;
  const percentage = Math.round((completed / total) * 100);
  
  return { completed, total, percentage };
}

export function createProgressBar(percentage: number, width: number = 30): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}%`;
}

function displayProgressUpdate(progress: SetupProgress, stepId: string, oldStatus: StepStatus, newStatus: StepStatus): void {
  const { completed, total, percentage } = calculateProgress(progress);
  const step = progress.steps[stepId];
  
  console.log('');
  
  if (newStatus === 'COMPLETED' && oldStatus !== 'COMPLETED') {
    // Celebration for completion
    printSuccess(`🎉 ${step.displayName} - Complete!`);
    
    if (percentage === 100) {
      console.log('');
      printSuccess('🚀 AMAZING! You\'ve completed your entire podcast site setup!');
      console.log('🎊 Time to celebrate - your site is ready for the world! 🎊');
    }
  } else if (newStatus === 'DEFERRED') {
    printInfo(`📅 ${step.displayName} - We'll come back to this later`);
  } else if (newStatus === 'CONFIRMED_SKIPPED') {
    printInfo(`⏭️  ${step.displayName} - Skipped`);
  }
  
  // Always show current progress
  console.log('');
  console.log(`📊 Overall Progress: ${createProgressBar(percentage)} (${completed}/${total} complete)`);
  console.log('');
}

export async function displayProgressReview(progress: SetupProgress): Promise<void> {
  const { completed, total, percentage } = calculateProgress(progress);
  
  console.log(`\n📊 Setup Progress for "${progress.podcastName}":`);
  console.log(`${createProgressBar(percentage)} (${completed}/${total} complete)\n`);
  
  SETUP_STEPS.forEach(stepDef => {
    const step = progress.steps[stepDef.id];
    const status = step?.status || 'NOT_STARTED';
    let icon = '⬜';
    let label = 'Not Started';
    
    switch (status) {
      case 'COMPLETED':
        icon = '✅';
        label = `Completed${step?.completedAt ? ` on ${new Date(step.completedAt).toLocaleDateString()}` : ''}`;
        break;
      case 'DEFERRED':
        icon = '📅';
        label = 'Deferred (will ask again)';
        break;
      case 'CONFIRMED_SKIPPED':
        icon = '⏭️';
        label = 'Skipped';
        break;
    }
    
    console.log(`${icon} ${stepDef.displayName}${stepDef.optional ? ' (optional)' : ''}`);
    console.log(`   ${label}`);
    if (status === 'NOT_STARTED' || status === 'DEFERRED') {
      console.log(`   ${stepDef.description}`);
    }
    console.log('');
  });
} 