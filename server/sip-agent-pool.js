const SipAgent = require('./sip-agent');

class SipAgentPool {
    constructor({ serverIp, domain, extensions, password, io }) {
        this.serverIp = serverIp;
        this.domain = domain;
        this.extensions = extensions; // Array of extension numbers
        this.password = password;
        this.io = io;
        this.agents = [];
        this.currentIndex = 0;
        
        // Create SipAgent for each extension
        this.extensions.forEach(ext => {
            const agent = new SipAgent({
                serverIp: this.serverIp,
                domain: this.domain,
                extension: ext,
                password: this.password,
                io: this.io
            });
            this.agents.push({
                extension: ext,
                agent: agent,
                busy: false
            });
        });
    }

    start() {
        console.log(`Starting SIP Agent Pool with ${this.agents.length} extensions...`);
        this.agents.forEach(({ extension, agent }) => {
            agent.start();
            console.log(`✓ Extension ${extension} initialized`);
        });
    }

    // Get next available agent using round-robin
    getAvailableAgent() {
        // Try to find an idle agent first
        const idleAgent = this.agents.find(a => !a.busy);
        if (idleAgent) {
            return idleAgent;
        }

        // If all busy, use round-robin (will queue internally)
        const agent = this.agents[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.agents.length;
        return agent;
    }

    // Add numbers to queue (distributed across agents)
    addToQueue(numbers) {
        // Distribute numbers evenly across all agents
        const chunkSize = Math.ceil(numbers.length / this.agents.length);
        
        this.agents.forEach((agentWrapper, index) => {
            const start = index * chunkSize;
            const end = start + chunkSize;
            const chunk = numbers.slice(start, end);
            
            if (chunk.length > 0) {
                agentWrapper.agent.addToQueue(chunk);
                console.log(`Assigned ${chunk.length} numbers to extension ${agentWrapper.extension}`);
            }
        });
    }

    stopQueue() {
        this.agents.forEach(({ agent }) => agent.stopQueue());
    }

    // Start blast call (distributed)
    async startBlastCall(numbers, duration) {
        // Distribute numbers across agents
        const chunkSize = Math.ceil(numbers.length / this.agents.length);
        
        const promises = this.agents.map((agentWrapper, index) => {
            const start = index * chunkSize;
            const end = start + chunkSize;
            const chunk = numbers.slice(start, end);
            
            if (chunk.length > 0) {
                console.log(`Extension ${agentWrapper.extension}: Blasting ${chunk.length} numbers`);
                return agentWrapper.agent.startBlastCall(chunk, duration);
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
    }

    stopBlastCall() {
        this.agents.forEach(({ agent }) => agent.stopBlastCall());
    }

    // Fair Queue System for Multiple Users
    // Each user gets a batch of calls immediately, then queues for next batch
    async startFairBlastCall(userId, numbers, duration) {
        const BATCH_SIZE = 10; // Each user gets 10 numbers per round
        
        // Split user's numbers into batches
        const batches = [];
        for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
            batches.push(numbers.slice(i, i + BATCH_SIZE));
        }

        console.log(`User ${userId}: ${numbers.length} numbers split into ${batches.length} batches`);

        // Process first batch immediately (distributed across all extensions)
        const firstBatch = batches[0];
        console.log(`User ${userId}: Starting first batch (${firstBatch.length} numbers)`);
        
        const chunkSize = Math.ceil(firstBatch.length / this.agents.length);
        const promises = this.agents.map((agentWrapper, index) => {
            const start = index * chunkSize;
            const end = start + chunkSize;
            const chunk = firstBatch.slice(start, end);
            
            if (chunk.length > 0) {
                return agentWrapper.agent.startBlastCall(chunk, duration);
            }
            return Promise.resolve();
        });

        await Promise.all(promises);

        // Queue remaining batches
        if (batches.length > 1) {
            console.log(`User ${userId}: ${batches.length - 1} batches queued`);
            // Process remaining batches sequentially
            for (let i = 1; i < batches.length; i++) {
                const batch = batches[i];
                console.log(`User ${userId}: Processing batch ${i + 1}/${batches.length} (${batch.length} numbers)`);
                
                const batchChunkSize = Math.ceil(batch.length / this.agents.length);
                const batchPromises = this.agents.map((agentWrapper, index) => {
                    const start = index * batchChunkSize;
                    const end = start + batchChunkSize;
                    const chunk = batch.slice(start, end);
                    
                    if (chunk.length > 0) {
                        return agentWrapper.agent.startBlastCall(chunk, duration);
                    }
                    return Promise.resolve();
                });

                await Promise.all(batchPromises);
            }
        }

        console.log(`User ${userId}: All batches completed`);
    }

    // Get pool statistics
    getStats() {
        return {
            totalAgents: this.agents.length,
            busyAgents: this.agents.filter(a => a.busy).length,
            idleAgents: this.agents.filter(a => !a.busy).length,
            extensions: this.agents.map(a => ({
                extension: a.extension,
                busy: a.busy,
                registered: a.agent.registered
            }))
        };
    }
}

module.exports = SipAgentPool;
