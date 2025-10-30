const core = require('@actions/core');
const { exec } = require('@actions/exec');
const artifact = require('@actions/artifact');
const { promises: fs } = require('fs');
const path = require('path');

async function run() {
  try {
    // Get inputs
    const reportDir = core.getInput('report-dir');
    const artifactName = 'playwright-report';
    
    // 1. Upload report as artifact
    const artifactClient = artifact.create();
    const uploadResponse = await artifactClient.uploadArtifact(
      artifactName,
      [`${reportDir}/**`],
      path.dirname(reportDir),
      { continueOnError: true }
    );

    if (uploadResponse.failedItems.length > 0) {
      core.warning(`Failed to upload some report files: ${uploadResponse.failedItems.join(', ')}`);
    }

    // 2. Add link to GitHub Actions summary
    const { GITHUB_RUN_ID, GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env;
    const repoUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`;
    const artifactUrl = `${repoUrl}/actions/runs/${GITHUB_RUN_ID}/artifacts?artifactName=${encodeURIComponent(artifactName)}`;
    
    await core.summary
      .addHeading('Playwright Test Report')
      .addRaw(`<a href="${artifactUrl}" target="_blank">View Playwright HTML Report</a>`)
      .write();

  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
