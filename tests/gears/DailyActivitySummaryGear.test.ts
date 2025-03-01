import { Gear } from '@/lib/models/Gear';
import * as fs from 'fs';
import * as path from 'path';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import * as dotenv from 'dotenv';

// Parse command line arguments to check if we should mock LLM calls
// Default to real responses unless explicitly asked to mock
const mockLlm = process.argv.includes('--mock-llms');
console.log(`Test mode: ${mockLlm ? 'Using mocked LLM responses' : 'Using real LLM calls'}`);

// If we're using real LLM calls, load environment variables
if (!mockLlm) {
  // Load environment variables from .env files
  const envFile = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envFile)) {
    console.log(`Loading environment from ${envFile}`);
    const result = dotenv.config({ path: envFile });
    console.log(`Dotenv loaded: ${result.parsed ? 'successfully' : 'failed'}`);
    
    // Debug loaded env vars (first few chars only for security)
    if (result.parsed && result.parsed.OPENAI_API_KEY) {
      console.log(`Found OPENAI_API_KEY in .env.local: ${result.parsed.OPENAI_API_KEY.substring(0, 8)}...`);
    } else {
      console.log('No OPENAI_API_KEY found in .env.local');
    }
  } else {
    console.log(`No .env.local file found at ${envFile}`);
    dotenv.config(); // Try default .env file
  }

  // Check if API key is set
  console.log(`OPENAI_API_KEY in process.env: ${process.env.OPENAI_API_KEY ? 'Set' : 'Not set'}`);
  if (process.env.OPENAI_API_KEY) {
    console.log(`Key starts with: ${process.env.OPENAI_API_KEY.substring(0, 8)}...`);
  }
} else {
  // Mock fetch since we're using mocked responses
  global.fetch = jest.fn();
}

describe('DailyActivitySummaryGear', () => {
  let gear: Gear;
  let slackChannelData: any;
  let slackUsersData: any;
  let jiraIssuesData: any;
  let jiraActivityData: any;
  let combinedData: any;

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

    // Create combined data
    combinedData = {
      slack: {
        channelHistory: slackChannelData,
        usersInfo: slackUsersData
      },
      jira: {
        recentIssues: jiraIssuesData,
        activityLog: jiraActivityData
      }
    };
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

    if (mockLlm) {
      // Mock the fetch implementation for the gear.processWithLLM method
      (global.fetch as jest.Mock).mockImplementation(() => 
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            content: 'Mocked LLM response for testing. This will be replaced by actual LLM response in real execution.'
          })
        })
      );

      // Override processWithLLM to return a mock response
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
    } else {
      // Override processWithLLM to call actual LLM using Vercel AI SDK
      gear['processWithLLM'] = async (input: string) => {
        try {
          // Parse the input data 
          const inputData = JSON.parse(input);
          
          // Log system prompt and user data for debugging
          console.log('\nSystem prompt:', gear.systemPrompt());
          console.log('\nUser data sample:', gear.userPrompt(inputData).substring(0, 500) + '...');
          
          // Make a real call to the LLM using Vercel AI SDK
          console.log('\nCalling LLM API...');
          
          // Use Vercel AI SDK to generate text
          const response = await generateText({
            model: openai('gpt-4o-mini'),
            messages: [
              { 
                role: 'system',
                content: gear.systemPrompt()
              },
              {
                role: 'user',
                content: gear.userPrompt(inputData)
              }
            ]
          });
          
          console.log('\nLLM processing complete.');
          return response.text;
        } catch (error) {
          console.error('Error processing with LLM:', error);
          throw error;
        }
      };
    }
  });

  afterEach(() => {
    if (mockLlm) {
      jest.clearAllMocks();
    }
  });

  test('processes Slack and JIRA data into a daily activity summary', async () => {
    // Process the data with our gear
    const result = await gear.process(JSON.stringify(combinedData));
    
    // Verify the output contains expected sections
    expect(result).toContain('Daily Activity Summary');
    
    if (mockLlm) {
      // Additional checks for mocked response
      expect(result).toContain('Team Communication (Slack)');
      expect(result).toContain('Project Status (JIRA)');
      expect(result).toContain('Action Items');
      expect(result).toContain('Notable Achievements');
      
      // Verify the processWithLLM method was called once
      expect(gear['processWithLLM']).toHaveBeenCalledTimes(1);
    } else {
      // When using real LLM, we can only make basic checks
      // as the exact response format may vary
      console.log('Full response from real LLM:', result);
    }
  // Increase timeout to 30 seconds for LLM API calls
  }, 30000);
});