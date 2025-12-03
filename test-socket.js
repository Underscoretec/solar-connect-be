/**
 * Quick Socket.IO Connection Test
 * Run this to verify Socket.IO server is working
 * 
 * Usage: node test-socket.js
 */

const io = require('socket.io-client');

console.log('🧪 Testing Socket.IO Connection...\n');

const socket = io('http://localhost:8022', {
  path: '/socket',
  transports: ['websocket', 'polling'],
  query: {
    conversationId: 'test-conversation-123'
  }
});

socket.on('connect', () => {
  console.log('✅ SUCCESS! Socket connected:', socket.id);
  console.log('✅ Socket.IO server is working correctly!\n');
  
  // Test joining room
  socket.emit('join_conversation', 'test-conv-456');
  console.log('📨 Sent join_conversation event\n');
  
  setTimeout(() => {
    console.log('🎉 All tests passed! Socket.IO is ready.');
    socket.disconnect();
    process.exit(0);
  }, 1000);
});

socket.on('connect_error', (error) => {
  console.error('❌ FAILED! Socket connection error:');
  console.error(error.message);
  console.error('\n💡 Make sure:');
  console.error('   1. Backend is running (pnpm dev)');
  console.error('   2. Port 8022 is not blocked');
  console.error('   3. Helmet is configured correctly\n');
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('👋 Socket disconnected:', reason);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('⏱️  Timeout: Could not connect within 5 seconds');
  process.exit(1);
}, 5000);

