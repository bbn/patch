import { Gear } from '@/lib/models/Gear';
import * as fs from 'fs';
import * as path from 'path';

// Mock fetch since we're processing offline
global.fetch = jest.fn();

describe('DailyActivitySummaryGear', () => {
  let gear: Gear;
  let slackChannelData: any;
  let slackUsersData: any;
  let jiraIssuesData: any;
  let jiraActivityData: any;

  beforeAll(() => {
    // Load fixture data
    const slackChannelPath = path.join(__dirname, '../fixtures/slack/channel_history.json');
    const slackUsersPath = path.join(__dirname, '../fixtures/slack/users_info.json');
    const jiraIssuesPath = path.join(__dirname, '../fixtures/jira/recent_issues.json');
    const jiraActivityPath = path.join(__dirname, '../fixtures/jira/activity_log.json');

    slackChannelData = JSON.parse(fs.readFileSync(slackChannelPath, 'utf8'));
    slackUsersData = JSON.parse(fs.readFileSync(slackUsersPath, 'utf8'));
    jiraIssuesData = JSON.parse(fs.readFileSync(jiraIssuesPath, 'utf8'));
    jiraActivityData = JSON.parse(fs.readFileSync(jiraActivityPath, 'utf8'));
  });

  beforeEach(() => {
    // Create a new gear for each test with no initial messages
    gear = new Gear({
      id: 'daily-activity-summary'
    });
    
    // Add messages as if in a conversation
    gear.addMessage({
      role: 'user',
      content: 'Please generate a daily activity summary from the inputs of Slack and JIRA data.'
    });

    gear.addMessage({ role: 'user', content: 'You are a helpful assistant that creates daily activity summaries.' });
    gear.addMessage({ role: 'user', content: 'You will receive data from Slack messages and JIRA issues to compile a comprehensive summary of the team\'s daily activities.' });
    
    gear.addMessage({ role: 'user', content: 'The summary should include:' });
    gear.addMessage({ role: 'user', content: '1. Key discussions and decisions from Slack' });
    gear.addMessage({ role: 'user', content: '2. Status updates on JIRA issues' });
    gear.addMessage({ role: 'user', content: '3. Notable achievements and blockers' });
    gear.addMessage({ role: 'user', content: '4. Action items for follow-up' });
    
    gear.addMessage({ role: 'user', content: 'Format the summary in a professional, easy-to-read manner suitable for a team update.' });

    // Mock the fetch implementation for the gear.processWithLLM method
    (global.fetch as jest.Mock).mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: 'Mocked LLM response for testing. This will be replaced by actual LLM response in real execution.'
        })
      })
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('processes Slack and JIRA data into a daily activity summary', async () => {
    // Override processWithLLM to return our own response instead of calling an actual LLM
    gear['processWithLLM'] = jest.fn().mockImplementation(() => {
      return Promise.resolve(`
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
      `);
    });

    // Combine Slack and JIRA data as input
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

    // Process the data with our gear
    const result = await gear.process(JSON.stringify(combinedData));
    
    // Verify the output contains expected sections
    expect(result).toContain('Daily Activity Summary');
    expect(result).toContain('Team Communication (Slack)');
    expect(result).toContain('Project Status (JIRA)');
    expect(result).toContain('Action Items');
    expect(result).toContain('Notable Achievements');
    
    // Verify the processWithLLM method was called once
    expect(gear['processWithLLM']).toHaveBeenCalledTimes(1);
  });
});