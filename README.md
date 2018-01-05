This is a blockchain wallet application based on Go Etheruem

** Installation
  (1) Install Go Ethereum:
    https://geth.ethereum.org/install/

  (2) Install Node.js
    https://nodejs.org/en/download/package-manager/

  (3) Install Express
    > sudo apt install node-express-generator

  (4) Install MongoDB
    > sudo apt-get install mongodb

  (5) Install NPM
    > sudo npm install -g npm@latest

  (6) Install Global NPM Packages
    > sudo npm install express -g
    > sudo npm install mongodb -g
    > sudo npm install web3 -g

  (7) Go to the project directory
    > cd your_path/Ethererum

  (8) Initialize Blockchain
    > geth --identity "Node01" --rpc --rpcport "8080" --rpccorsdomain "*" --datadir "/home/pc194/Ethereum/chain1/" --port "30303" --rpcapi "db,eth,net,web3" --networkid 196876 init genesis.json
    NOTE: Remember to keep params in ethereum_api.js consistent with the params above, if they are modified.

  (9) Replace SEVER_URL in HTML/js/main.js with your server's ip

** Run
  (1)
    > cd your_path/Ethererum
    > node ethereum_api.js
  (2)
    Open a browser and connect to "http://your_ip:8787/login.html"