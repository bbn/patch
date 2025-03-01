const fs = require('fs');
const path = require('path');
const { Gear } = require('../../lib/models/Gear');

/**
 * This script runs the Daily Activity Summary Gear with our fixture data
 * and outputs the result to the console.
 */
async function runDailyActivityGear() {
  // Load fixture data
  const slackChannelPath = path.join(__dirname, '../fixtures/slack/channel_history.json');
  const slackUsersPath = path.join(__dirname, '../fixtures/slack/users_info.json');
  const jiraIssuesPath = path.join(__dirname, '../fixtures/jira/recent_issues.json');
  const jiraActivityPath = path.join(__dirname, '../fixtures/jira/activity_log.json');

  const slackChannelData = JSON.parse(fs.readFileSync(slackChannelPath, 'utf8'));
  const slackUsersData = JSON.parse(fs.readFileSync(slackUsersPath, 'utf8'));
  const jiraIssuesData = JSON.parse(fs.readFileSync(jiraIssuesPath, 'utf8'));
  const jiraActivityData = JSON.parse(fs.readFileSync(jiraActivityPath, 'utf8'));

  // Create combined data
  const combinedData = {
    slack: {
      channelHistory: slackChannelData,
      usersInfo: slackUsersData
    },
    jira: {
      recentIssues: jiraIssuesData,
      activityLog: jiraActivityData
    }
  };

  // Create gear with instructions
  const gear = new Gear({
    id: 'daily-activity-summary',
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant that creates daily activity summaries.
        You will receive data from Slack messages and JIRA issues to compile a comprehensive summary 
        of the team's daily activities. The summary should include:
        
        1. Key discussions and decisions from Slack
        2. Status updates on JIRA issues
        3. Notable achievements and blockers
        4. Action items for follow-up
        
        Format the summary in a professional, easy-to-read manner suitable for a team update.`
      },
      {
        role: 'user',
        content: 'Please generate a daily activity summary from the Slack and JIRA data.'
      }
    ]
  });

  // Override processWithLLM to simulate LLM processing
  // In a real implementation, this would call an actual LLM API
  gear.processWithLLM = async (input) => {
    try {
      // Parse the input data 
      const inputData = JSON.parse(input);
      
      // Log system prompt and user data for debugging
      console.log('\nSystem prompt:', gear.systemPrompt());
      console.log('\nUser data sample:', gear.userPrompt(inputData).substring(0, 500) + '...');
      
      // Create mock response
      console.log('\nSimulating LLM processing...');
      
      // This is where you would normally call an LLM API
      // For testing purposes, we'll return a formatted mock response
      return `
# Daily Activity Summary - February 25, 2023

## Team Communication (Slack)

### Key Discussions
- John Doe has pushed fixes for the user authentication bug and the PR is ready for review
- Jane Smith will review the authentication fix PR this afternoon
- Team stand-up scheduled for 10:30 AM
- Performance issue in production environment is being investigated by John Doe
- Potential database indexing issue identified as cause of performance problems

## Project Status (JIRA)

### Active Issues
- PROJ-101: User authentication fails on mobile devices (In Progress, John Doe)
  - John moved this to In Progress
  - John identified differing API endpoints between mobile and desktop
- PROJ-103: Performance issue in production environment (In Progress, John Doe)
  - Critical priority issue
  - John moved this to In Progress

### Completed Work
- PROJ-104: Create UI design for new settings page (Done, Jane Smith)
  - QA testing completed with positive results

### Upcoming Work
- PROJ-102: Implement password reset functionality (To Do, Sarah Wilson)

## Action Items
1. Continue work on authentication fixes
2. Address the critical performance issue in production
3. Review completed UI designs for the settings page
4. Prepare for the upcoming password reset functionality implementation

## Notable Achievements
- UI design for settings page completed and passed QA
- Root cause identified for authentication issues
      `;
    } catch (error) {
      console.error('Error processing with LLM:', error);
      throw error;
    }
  };

  // Process the data
  try {
    console.log('Starting Daily Activity Summary generation...');
    const result = await gear.process(JSON.stringify(combinedData));
    console.log('\nResult:\n');
    console.log(result);
  } catch (error) {
    console.error('Error running gear:', error);
  }
}

// Run the script
runDailyActivityGear().catch(console.error);