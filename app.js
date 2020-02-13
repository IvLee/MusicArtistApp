const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring')

const server_address = 'localhost';
const port = 3000;
let artist_image = "";
const authentication_cache = './auth/authentication_res.json';
const credentials_json = fs.readFileSync('./auth/credentials.json', 'utf8');
const credentials = JSON.parse(credentials_json);
const post_data = querystring.stringify({client_id: credentials.client_id, client_secret: credentials.client_secret, grant_type: credentials.grant_type});
const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': post_data.length
  }
};

let html_stream = fs.createReadStream('./html/search-form.html','utf8');

//create server
let server = http.createServer((req,res)=>{
	//checks url for /,favicon.ico,/artists/,and /search
	if(req.url === '/'){
		console.log(`A new request was made from ${req.connection.remoteAddress} for ${req.url}`);
    var html = fs.readFileSync('./html/search-form.html');
		res.writeHead(200,{'Content-Type':'text/html'});
		res.end(html);
		}
	else if(req.url.includes('/favicon.ico')){ //404 error if at favicon
		res.writeHead(404);
		res.end();
	}

	else if(req.url.includes('/artists/')){ //looks for the picture needed for the artist
		console.log(`Request made from ${req.connection.remoteAddress} for ${req.url}`);
	  fs.readFile(artist_image, function(err, data) {
		 if (err) throw err; // Fail if the file can't be read.
		 res.writeHead(200, {'Content-Type': 'image/jpeg'});
		 res.end(data);
	 });
	}

	else if(req.url.includes('/search')){
		//parse the url
		var urlVal = req.url;
		var parseUrl = url.parse(urlVal,true,true);
		var user_input = parseUrl.query;
		console.log(`A new request was made from ${req.connection.remoteAddress} for ${req.url}`);
		console.log(user_input);

    if(user_input.artist.length === 0){//if no artist was searched, returns user to the search screen.
      console.log('Search parameters are empty, returned back to search screen');
      var html = fs.readFileSync('./html/search-form.html');
  		res.writeHead(200,{'Content-Type':'text/html'});
  		res.end(html);
    }

    else{
		let cache_valid = false;
  		if(fs.existsSync(authentication_cache)) { //checks if the token is still valid and if not will request a new token
  			content = fs.readFileSync(authentication_cache, 'utf8');
  			cached_auth = JSON.parse(content);
  			if(new Date(cached_auth.expiration) > Date.now()){
          var time_remain = Math.floor(((cached_auth.expiration - Date.now())/1000)/60); //converts time remaining to mins.
          console.log('Token: ' + cached_auth.access_token + " still ok, " + time_remain + " mins left before expiration.");
  				cache_valid = true;
  			}
  			else{
  				console.log('Token Expired');
  			}
  		}
  		if(cache_valid){ //if the token is still valid, skip to search function
  			create_search_req(cached_auth,res,user_input);
  		}
  		else{ //requests for token to access spotify data
  		const authentication_req_url = 'https://accounts.spotify.com/api/token';
  		let request_sent_time = new Date();
  		let authentication_req = https.request(authentication_req_url, options, authentication_res => {
  			received_authentication(authentication_res, res, user_input,request_sent_time);
  		});
  		authentication_req.on('error', (e) => {
  			console.error(e);
  		});
  		authentication_req.write(post_data);
  		console.log("Requesting Token");
  		authentication_req.end();
  		}
  	}
  }
});

console.log('Now listening on port ' + port);
server.listen(port,server_address);

//function to acquire access token and save to a .json file
function received_authentication(authentication_res, res, user_input, request_sent_time){
	authentication_res.setEncoding("utf8");
	let body = "";
	authentication_res.on("data", data => {body += data;});
	authentication_res.on("end", () => {
		let authentication_res_data = JSON.parse(body);
		authentication_res_data.expiration = request_sent_time.getTime()+3600*1000;
		console.log(authentication_res_data);
		create_cache(authentication_res_data);
		create_search_req(authentication_res_data,res,user_input,request_sent_time);
	});
}

// used to create the .json file where the token will be stored.
function create_cache(authentication_res_data){
	var authentication_cache = JSON.stringify(authentication_res_data);
	fs.writeFile('./auth/authentication_res.json', authentication_cache, (err) => {
	if (err) throw err;
	console.log('The token has been saved to ./auth/authentication_res.json.');
		});
}

//used to search for the artists that have that same name as what the user has inputted and displays it to the user.
function create_search_req(authentication_res_data,res,user_input,request_sent_time){
		const get_data = {access_token: authentication_res_data.access_token, q: user_input.artist, type: "artist"};
		const qstring = querystring.stringify(get_data);
		const search_url = 'https://api.spotify.com/v1/search?' + qstring;
		let search = https.request(search_url, search_res =>{
			let body = "";
			search_res.on("data", data => {body += data;});
			search_res.on("end", () => {
				search_data = JSON.parse(body);
				//console.log(search_url);
				//console.log(search_data);

        try{ //try and catch for any other possible errors

        //checks if the artist is available, if not then user is notified and can try again
        if(search_data.artists.items.length === 0){
            console.log("Artist not found.");
            var html = fs.readFileSync('./html/search-form.html');
            res.writeHead(200,{'Content-Type':'text/html'});
            res.write(`<h1>Artist not found</h1>`);
            res.end(html);
            }

        else{
          //parsing each section of the data received from spotify
  				let img_url = url.parse(search_data.artists.items[0].images[0].url);
  				let img_path = "./artists" + img_url.path.substring(img_url.path.lastIndexOf("/"), img_url.path.length) + ".jpg";
  				let artist_name = search_data.artists.items[0].name;
  				let genre = search_data.artists.items[0].genres;
  				artist_image = img_path; //sets the artist_image var to the path of the image. This is then called when the url inlcude /artists/

          //checks if the image is available and if it is displays it to the user. else looks up the image.
  				if(fs.existsSync(img_path)){
            var html = fs.readFileSync('./html/search-form.html');
            console.log('Image is available in ' + img_path);
  					let webpage = `<h1>${artist_name}</h1> <p>${genre}</p><img src = "${img_path}"/>`;
  					res.writeHead(200,{'Content-Type':'text/html'});
            res.write(html);
  					res.end(webpage);
  				}
  				else{
  					console.log("Image not available, Requesting Image");
  					create_image_req(img_url,img_path,artist_name,genre, res);
  				}
      }
    }

    catch(e){//error is caught, notifes user and asks to try again.
      var html = fs.readFileSync('./html/search-form.html');
      res.writeHead(200,{'Content-Type':'text/html'});
      res.write(`<h1>Error, try again</h1>`);
      res.end(html);
    }
			});
		})

		search.on('error', (e) => {
			console.error(e);
		});
		search.end();
}

//downloads the images if the images are not initially available and displays it to the user.
function create_image_req(img_url,img_path, artist_name, genre, res){
	let image_req = https.get(img_url, image_res =>{
    var html = fs.readFileSync('./html/search-form.html');
		let new_img = fs.createWriteStream(img_path,{'encoding': null});
		image_res.pipe(new_img);
		new_img.on('finish', function() { //displays the content to the user
			let webpage = `<h1>${artist_name}</h1> <p>${genre}</p><img src = "${img_path}"/>`;
			res.writeHead(200,{'Content-Type':'text/html'});
      res.write(html);
			res.end(webpage);
		});
	});
	image_req.on('error',function(err) {console.log(err);});
}
