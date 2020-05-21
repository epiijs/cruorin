/* eslint-disable global-require */

function connectToPM2() {
  let pm2;
  try {
    pm2 = require('pm2');
  } catch (error) {
    pm2 = null;
  }
  if (!pm2) return null;
  let pm2Ids = [];
  pm2.list((error, list) => {
    if (error) {
      console.error(error);
      return;
    }
    if (list.length === 0) return;
    pm2Ids = list.map(item => item.pm2_env.pm_id);
  });
  return (action, payload) => {
    pm2Ids.forEach(id => {
      if (Number(process.env.pm_id) !== Number(id)) {
        pm2.sendDataToProcessId(
          { id, data: { action, payload }, topic: 'message' },
          (error) => { if (error) console.error(error); }
        );
      }
    });
  };
}

class Bridge {
  constructor(handler) {
    this.senders = [];
    this.senders.push(connectToPM2());
    process.on('message', (message) => {
      const { action, payload } = message;
      if (handler[action]) {
        handler[action](payload);
      }
    });
  }

  sendMessage(action, payload) {
    this.senders.forEach(sender => {
      if (sender) {
        sender(action, payload);
      }
    });
  }
}

module.exports = Bridge;
