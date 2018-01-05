#!/usr/bin/env nodejs

// TODO:
// (1) V Unlock Account on login
// (2) V Lock Account on logout
// (3) V Transfer
// (4) V Admin-logout
// (5) V Auto-logout
// (6) V Init balance: 1000 eth
// (7) Login token identifier
// (7) Drop accounts(Mongo, Geth)
// (8) Inter-Machine operation by WebSocket
// (9) Restful API

var Web3 = require('web3');
var mongodb = require('mongodb');
var express = require('express');
var spawn = require('child_process').spawn;

const NODE_IDENTITY = 'Node01';
const BLOCK_DATA_DIR = '/home/pc194/Ethereum/chain1/';
const GETH_LISTEN_PORT = '30303';
const RPC_PORT = '8080';
const RPC_URL = '127.0.0.1:' + RPC_PORT;
const RPC_DOMAIN = '*';
const RPC_API = 'db,eth,net,web3,personal';
const NETWORK_ID = 196876;
const ADMIN_ADDR = "0xc725790de038b92573ea175c4b15c8c62d92df54";
const ADMIN_ID = "admin";
const ADMIN_PASSWD = "admin";
const ACTIVE_TIME_LIMIT = 5 * 60 * 1000;
const CHECK_ACTIVE_INTERVAL = ACTIVE_TIME_LIMIT / 2;
const CMD_TIME_LIMIT = 3000;

var mongodbServer = new mongodb.Server('localhost', 27017, { auto_reconnect: true });
var account_db = new mongodb.Db('account_db', mongodbServer);
var account_collection = null;
var app = express();
var web3;
var startGethCmd;
var createAccountCmd;
var unlockAccountCmd;
var lockAccountCmd;
var checkBalanceCmd;

startGeth();
startDB();
setExitHandler();
startServer();

//----------------------- Initialization Functions -----------------------//

function startGeth() {
	startGethCmd = spawn('geth', ['--identity', NODE_IDENTITY, '--rpc', '--rpcport', RPC_PORT, '--rpccorsdomain', RPC_DOMAIN, '--datadir', BLOCK_DATA_DIR, '--port', GETH_LISTEN_PORT, '--rpcapi', RPC_API, '--networkid', NETWORK_ID, '--etherbase', ADMIN_ADDR, '--mine']);

	// startGethCmd.stdout.once('data', function (data) {
	// 	console.log('stdout: ' + JSON.stringify(data.error));
	// });

	// startGethCmd.stderr.once('data', function (data) {
	// 	console.log('stderr: ' + JSON.stringify(data.error));
	// });

	startGethCmd.on('exit', function (code) {
		console.log('Geth child process exited with code ' + code.toString());
	});

	setTimeout(() => {
		startGethCmd.removeListener('exit', () => {});
	}, CMD_TIME_LIMIT);

	web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:' + RPC_PORT));
}

function startDB() {
	account_db.open(function(err, opened_db) {
		if (err) {
			console.log("Error occur on opening db: " + err);
		}
		else {
			account_db = opened_db;
	        account_db.collection('account', function(err, opened_collection) {
		        if (err) {
			        console.log("Error occur on open collection: " + err);
		        }
		        else {
			        account_collection = opened_collection;
                    checkAdminAccount();
		        }
	        });
		}
	});
}

function setExitHandler() {
	//do something when app is closing
	process.on('exit', exitHandler.bind(null,{cleanup:true}));

	//catches ctrl+c event
	process.on('SIGINT', exitHandler.bind(null, {exit:true}));

	//catches uncaught exceptions
	process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
}

function exitHandler(options, err) {
	account_db.close();
    if (options.cleanup) console.log('clean');
    if (err) console.log(err.stack);
    if (options.exit) {
		console.log("\nserver stopped.")
		process.exit();
	}
}

function startServer() {
	console.log('Node-Express server is running at 140.112.18.194:8787 ');
	app.use('/', express.static(__dirname + '/HTML'));
	app.get('/create/', onCreate);
	app.get('/login/', onLogin);
	app.get('/logout/', onLogout);
	app.get('/change-passwd/', onChangePasswd);
	app.get('/check-balance/', onCheckBalance);
	app.get('/transfer/', onTransfer);
	app.listen(8787,'0.0.0.0');

	setInterval(function () {
		autoLogout();
	}, CHECK_ACTIVE_INTERVAL);
}

//----------------------- Initialization Functions -----------------------//



//----------------------- Utility Functions -----------------------//

function writeResponse(resp, result) {
	if (resp) {
		resp.send("" + JSON.stringify(result));
	}
}

function printInfo(obj) {
	console.log("\n\n### Object Info ###")
	for (var attr in obj) {
		if (obj.hasOwnProperty(attr)) {
			console.log(attr + ": " + obj[attr]);
		}
	}
	console.log("### Object Info ###")
	console.log('\n');
}

//----------------------- Utility Functions -----------------------//



//----------------------- Request Handler Functions -----------------------//

function onCreate(req, resp) {
	if (!req.query.a_id) {
		writeResponse(resp, { Success: false, Err: "a_id not specified."});
		return;
	}

	account_collection.findOne({ a_id: req.query.a_id }, function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}

		if (data) {
			/* Found this account => cannot create again */
			console.log('account: ' + data.a_id + ' existed!');
			writeResponse(resp, { Success: false, Err: "Account existed"});
		} else {
			/* Account not found => can create */
			console.log('Can create account');
			createAccount(req.query, resp);
		}
	});
}

function onLogin(req, resp){
	if (!req.query.a_id) {
		writeResponse(resp, { Success: false, Err: "a_id not specified."});
		return;
	}

	account_collection.findOne({ a_id: req.query.a_id }, function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}
		if (data) {
			/* Found this account => can login */
			req.query.passwd = req.query.passwd || '';
			console.log('Try to login account: ' + data.a_id);
			if (req.query.passwd === data.passwd){
				if(data.isOnline === false){
					loginAccount(req, data, resp);
					console.log('account: ' + data.a_id + ' logged-in');
				}
				else{
					console.log('account: ' + data.a_id + ' has already logged-in');
					writeResponse(resp, { Success: false, Err: "Account has already logged-in"});
				}
			}
			else if(req.query.passwd !== data.passwd){
				console.log('account: ' + data.a_id + ' wrong password');
				writeResponse(resp, { Success: false, Err: "Wrong password"});
			}
		}
		else {
			/* Account not found => can' login */
			console.log('Account not found');
			writeResponse(resp, { Success: false, Err: "Account not found(cannot login)"});
		}
	});
}

function onLogout(req, resp) {
	if (!req.query.a_id) {
		writeResponse(resp, { Success: false, Err: "a_id not specified."});
		return;
	}

	account_collection.findOne({ a_id: req.query.a_id }, function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}
		if (data) {
			/* Found this account => can logout */
			if (data.isOnline === true) {
				var curr_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
				if (curr_ip === data.user_ip){
					logoutAccount(data, resp);
					console.log('account: ' + data.a_id + ' logged-out');
				}
				else {
					adminLogout(data, curr_ip, resp);
				}
			}
			else {
				/* Cannot logout */
				console.log('account: ' + data.a_id + ' has not logged-in');
				writeResponse(resp, { Success: false, Err: "Account has not logged-in"});
			}
		}
		else {
			/* Account not found => can' logout */
			console.log('Account not found');
			writeResponse(resp, { Success: false, Err: "Account not found(cannot login)"});
		}
	});
}

function onChangePasswd(req, resp){
	if (!req.query.a_id) {
		writeResponse(resp, { Success: false, Err: "a_id not specified."});
		return;
	}

	account_collection.findOne({ a_id: req.query.a_id }, function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}
		if (data) {
			/* Found this account => can change passwd */
			var curr_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
			console.log('Try to change passwd, account: ' + data.a_id);
			if (curr_ip === data.user_ip){
				if(data.isOnline === true){
					changePasswd(req.query, resp, data.passwd);
					console.log('account: ' + data.a_id + ' has changed passwd');
				}
				else{
					/* Cannot change passwd */
					console.log('account: ' + data.a_id + ' has not logged-in');
					writeResponse(resp, { Success: false, Err: "Account has not logged-in"});
				}
			}
			else {
				console.log('account: ' + data.a_id + ' wrong user_ip');
				writeResponse(resp, { Success: false, Err: "Wrong user_ip"});
			}
		}
		else {
			/* Account not found => can' logout */
			console.log('Account not found');
			writeResponse(resp, { Success: false, Err: "Account not found(cannot login)"});
		}
	});
}

function onCheckBalance(req, resp) {
	if (!req.query.a_id) {
		writeResponse(resp, { Success: false, Err: "a_id not specified."});
		return;
	}

	account_collection.findOne({ a_id: req.query.a_id }, function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}
		if (data) {
			/* Found this account => get address */
			console.log('Account: ' + data.a_id + ' found');
			checkCurrentAccountBalance(data.address, resp);
		}
		else {
			/* Account not found */
			console.log('Account not existed');
			writeResponse(resp, { Success: false, Err: "Account not existed"});
		}
	});
}

function onTransfer(req, resp) {
	if (!req.query.a_id) {
		writeResponse(resp, { Success: false, Err: "a_id not specified."});
		return;
	}

	if (!req.query.to_id) {
		writeResponse(resp, { Success: false, Err: "to_id not specified."});
		return;
	}

	if (!req.query.amount) {
		writeResponse(resp, { Success: false, Err: "amount not specified."});
		return;
	}

	account_collection.findOne({ a_id: req.query.a_id }, function(err, from_account) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}
		if (from_account) {
			/* Found this account => check ip */
			var curr_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
			console.log('Try to transfer from account: ' + from_account.a_id);
			if (curr_ip === from_account.user_ip) {
				if (from_account.isOnline === true) {
					var from_addr = from_account.address;
					account_collection.findOne({ a_id: req.query.to_id }, function(err, to_account) {
						if (err) {
							console.log("Error occur on query: " + err);
							writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
							return;
						}
						if (to_account) {
							var to_addr = to_account.address;
							/* Found this account => can transfer */
							console.log('Try to transfer to account: ' + to_account.a_id);
							unlockAccount(from_addr, from_account.passwd, () => {
								console.log('Transferring...');
								transfer(from_addr, to_addr, req.query.amount, resp, () => {
									console.log('Transfer complete.');
									lockAccount(from_addr);
								});
							});
							// transfer(from_addr, to_addr, req.query.amount, resp);
						}
						else {
							/* Account not found => can' transfer */
							console.log('Account not found');
							writeResponse(resp, { Success: false, Err: "Account not found(cannot login)"});
						}
						account_collection.update({a_id: req.query.a_id}, { $set : {last_active: new Date().getTime()}
							}, function(err, data) {
								if (err) {
									console.log('Failed to update last_active, Err: ' + err);
									return;
								} else {
									console.log('Successfully update last_active');
									return;
								}
							});
						return;
					});
				}
				else {
					/* Cannot transfer */
					console.log('account: ' + data.a_id + ' has not logged-in');
					writeResponse(resp, { Success: false, Err: "Account has not logged-in"});
					return;
				}
			}
			else {
				console.log('account: ' + data.a_id + ' wrong user_ip');
				writeResponse(resp, { Success: false, Err: "Wrong user_ip"});
				return;
			}
		}
		else {
			/* Account not found => can' transfer */
			console.log('Account not found');
			writeResponse(resp, { Success: false, Err: "Account not found(cannot login)"});
			return;
		}
	});
}

//----------------------- Request Handler Functions -----------------------//



//----------------------- Action Functions -----------------------//

function checkAdminAccount() {
    console.log("Checking admin account...");
    account_collection.findOne({a_id: ADMIN_ID}, function(err, data) {
		if (data) {
            console.log("Admin found.");
            //printInfo(data);
			/* Found this account => cannot create again */
		} else {
			/* Admin account not found => need to create */
			console.log('Creating admin account...');
			insertAdminAccount();
		}
	});
}

function insertAdminAccount() {
	const admin_account = {
		a_id: ADMIN_ID,
		passwd: ADMIN_PASSWD || '',
		address: ADMIN_ADDR,
		user_ip: '',
		isOnline: false,
		last_active: new Date().getTime()
	};

	account_collection.insert(admin_account, function(err, data) {
		if (err) {
			console.log('Failed to insert admin account, Err: ' + err);
		} else {
			console.log('Successfully insert admin account: ');
			printInfo(admin_account);
		}
	});
}

function createAccount(info, resp) {
	var createRPC = {
		jsonrpc: '2.0',
		method: 'personal_newAccount',
		params: [info.passwd],
		id: 1
	};
	createAccountCmd = spawn('curl', ['-X', 'POST', '--data', JSON.stringify(createRPC), RPC_URL]);

	createAccountCmd.stdout.once('data', function (data) {
		data = JSON.parse(data);
		if (!data.result) {
			console.log('Failed to create account, Err: ' + JSON.stringify(data.error));
			writeResponse(resp, { Success: false, Err: "Geth Error When Creating Account" });
		}
		else {
			var address = data.result;
			var new_account = {
				a_id: info.a_id,
				passwd: info.passwd || '',
				address,
				user_ip: '',
				isOnline: false,
				last_active: new Date().getTime()
			};

			account_collection.insert(new_account, function(err, data) {
				if (err) {
					console.log('Account created but failed to insert, Err: ' + err);
					writeResponse(resp, { Success: false, Err: "Internal DB Error(insert)" });
					return;
				} else {
					console.log('Successfully create account: ');
					printInfo(new_account);
					giveBalance(new_account, 1000);
					writeResponse(resp, { Success: true });
					return;
				}
			});
		}
	});

	// createAccountCmd.stderr.once('data', function (data) {
	// 	console.log('stderr: ' + JSON.stringify(data.error));
	// });

	// createAccountCmd.on('exit', function (code) {
	// 	console.log('Geth child process exited with code ' + code.toString());
	// });

	// setTimeout(() => {
	// 	createAccountCmd.removeListener('exit', () => {});
	// }, CMD_TIME_LIMIT);
}

function loginAccount(info, account_data, resp) {
	var curr_ip = info.headers['x-forwarded-for'] || info.connection.remoteAddress;

	account_collection.update({a_id: account_data.a_id, isOnline : false, user_ip : ''}, { $set : {isOnline : true, user_ip : curr_ip, last_active: new Date().getTime()}
	}, function(err, data) {
		if (err) {
        	console.log('Failed to login, Err: ' + err);
            writeResponse(resp, { Success: false, Err: "Internal DB Error(update)" });
            return;
        } else {
            console.log('Successfully login, unlocking account...');
			unlockAccount(account_data.address, account_data.passwd);
            writeResponse(resp, { Success: true });
            return;
        }
	});
}

function unlockAccount(address, passwd, callback) {
    var unlockRPC = {
		jsonrpc: '2.0',
		method: 'personal_unlockAccount',
		params: [address, passwd],
		id: 1
	};
	unlockAccountCmd = spawn('curl', ['-X', 'POST', '--data', JSON.stringify(unlockRPC), RPC_URL]);

	unlockAccountCmd.stdout.once('data', function (data) {
		data = JSON.parse(data);
		if (data.result !== true) {
			console.log('Failed to unlock account, Err:' + JSON.stringify(data.error));
		    if (callback) {
                callback();
            }
        }
		else {
			console.log('Successfully unlock account.');
			if (callback) {
				callback();
			}
		}
	});

	// unlockAccountCmd.stderr.once('data', function (data) {
	// 	console.log('stderr: ' + JSON.stringify(data.error));
	// });

	// unlockAccountCmd.on('exit', function (code) {
	// 	console.log('Geth child process exited with code ' + code.toString());
	// });

	// setTimeout(() => {
	// 	unlockAccountCmd.removeListener('exit', () => {});
	// }, CMD_TIME_LIMIT);
}

function lockAccount(address) {
	var lockRPC = {
		jsonrpc: '2.0',
		method: 'personal_lockAccount',
		params: [address],
		id: 1
	};
	lockAccountCmd = spawn('curl', ['-X', 'POST', '--data', JSON.stringify(lockRPC), RPC_URL]);

	lockAccountCmd.stdout.once('data', function (data) {
		data = JSON.parse(data);
		if (data.result !== true) {
			console.log('Failed to lock account, Err:' + JSON.stringify(data.error));
		}
		else {
			console.log('Successfully lock account.');
		}
	});

	// lockAccountCmd.stderr.once('data', function (data) {
	// 	console.log('stderr: ' + JSON.stringify(data.error));
	// });

	// lockAccountCmd.on('exit', function (code) {
	// 	console.log('Geth child process exited with code ' + code.toString());
	// });

	// setTimeout(() => {
	// 	lockAccountCmd.removeListener('exit', () => {});
	// }, CMD_TIME_LIMIT);
}

function adminLogout(account_data, curr_ip, resp) {
	account_collection.findOne({ a_id: 'admin' }, function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			writeResponse(resp, { Success: false, Err: "Internal DB Error(query)"});
			return;
		}
		if (data) {
			// Admin account found
			if (data.isOnline === true && curr_ip === data.user_ip) {
				logoutAccount(account_data, resp);
			}
			else {
				console.log("Non-admin cannot logout other's account");
				writeResponse(resp, { Success: false, Err: "You cannot logout other's account!"});
			}
		}
		else {
			/* Admin account not found => can' logout */
			console.log('Admin account not found');
			writeResponse(resp, { Success: false, Err: "You cannot logout other's account!"});
		}
	});
}

function logoutAccount(account_data, resp) {
	console.log('Try to logout account: ' + account_data.a_id);
	account_collection.update({a_id: account_data.a_id, isOnline : true}, { $set : {isOnline : false, user_ip : ''}
	}, function(err, data) {
		if (err) {
        	console.log('Failed to logout, Err: ' + err);
            writeResponse(resp, { Success: false, Err: "Internal DB Error(update)" });
            return;
        } else {
            console.log('Successfully logout, locking account...');
			lockAccount(account_data.address);
            writeResponse(resp, { Success: true });
            return;
        }
	});
}

function changePasswd(info, resp, oldPasswd){
	account_collection.update({a_id: info.a_id, passwd: oldPasswd}, { $set : {passwd: info.passwd, last_active: new Date().getTime()}
	}, function(err, data) {
		if (err) {
        	console.log('Failed to change passwd, Err: ' + err);
            writeResponse(resp, { Success: false, Err: "Internal DB Error(update)" });
            return;
        } else {
            console.log('Successfully change passwd');
            writeResponse(resp, { Success: true });
            return;
        }
	});
}

function checkCurrentAccountBalance(addr, resp) {
	var chackBalanceRPC = {
		jsonrpc: '2.0',
		method: 'eth_getBalance',
		params: [addr, "latest"],
		id: 1
	};
	checkBalanceCmd = spawn('curl', ['-X', 'POST', '--data', JSON.stringify(chackBalanceRPC), RPC_URL]);

	checkBalanceCmd.stdout.once('data', function (data) {
		data = JSON.parse(data);
		if (!data.result) {
			console.log('Failed to check account balance, Err:' + JSON.stringify(data.error));
			writeResponse(resp, { Success: false, Err: "Geth error on checking balance" });
		}
		else {
			console.log('Successfully get account balance: ' + data.result);
			var balance = web3.utils.fromWei(data.result, 'ether');
			writeResponse(resp, { Success: true, Balance: "" + balance });
		}
	});

	// checkBalanceCmd.stderr.once('data', function (data) {
	// 	console.log('stderr: ' + JSON.stringify(data.error));
	// });

	// checkBalanceCmd.on('exit', function (code) {
	// 	console.log('Geth child process exited with code ' + code.toString());
	// });

	// setTimeout(() => {
	// 	checkBalanceCmd.removeListener('exit', () => {});
	// }, CMD_TIME_LIMIT);

	return;
}

function transfer(from_addr, to_addr, amount, resp, callback) {
	var transferRPC = {
		jsonrpc: '2.0',
		method: 'eth_sendTransaction',
		params: [{
			from: from_addr,
			to: to_addr,
			value: web3.utils.fromDecimal(web3.utils.toWei(parseFloat(amount), "ether"))
		}],
		id: 1
	};
	transferCmd = spawn('curl', ['-X', 'POST', '--data', JSON.stringify(transferRPC), RPC_URL]);

	transferCmd.stdout.once('data', function (data) {
		data = JSON.parse(data);
		if (!data.result) {
			console.log('Failed to transfer, Err:' + JSON.stringify(data.error));
			if (data.error.code === -32000) {
				writeResponse(resp, { Success: false, Err: "Cannot transfer such large amount" });
			}
			else {
				writeResponse(resp, { Success: false, Err: "Geth error on transfer" });
			}
		}
		else {
			console.log('Successfully transfer.');
			writeResponse(resp, { Success: true, Hash: "" + data.result });
			if (callback) {
				callback();
			}
		}
	});

	// transferCmd.stderr.once('data', function (data) {
	// 	console.log('stderr: ' + JSON.stringify(data.error));
	// });

	// transferCmd.on('exit', function (code) {
	// 	console.log('Geth child process exited with code ' + code.toString());
	// });

	// setTimeout(() => {
	// 	transferCmd.removeListener('exit', () => {});
	// }, CMD_TIME_LIMIT);

	return;
}

function giveBalance(account, amount) {
	unlockAccount(ADMIN_ADDR, ADMIN_PASSWD, () => {
		transfer(ADMIN_ADDR, account.address, amount, undefined, () => {
			lockAccount(ADMIN_ADDR);
		});
	});
}

function autoLogout() {
	console.log("Auto logout...");

	var timeLimit = new Date().getTime() - ACTIVE_TIME_LIMIT;
	account_collection.find({ isOnline: true, last_active: { $lt: timeLimit } }).toArray(function(err, data) {
		if (err) {
			console.log("Error occur on query: " + err);
			return;
		}
		if (data) {
			/* Found expired account => logout */
			data.forEach((account) => {
				logoutAccount(account);
			});
		}
		else {
			/* Account not found */
			console.log('No expired account');
		}
	});
}

//----------------------- Action Functions -----------------------//
