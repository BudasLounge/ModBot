var axios = require('axios');
var fs = require('fs');

/**
 * Class that provides a simple wrapper around Axios to make interacting with the LabsAPI easier.
 * You'll need a variable called auth_win that will store a popup window used for CAS authentication.
 * The popup window will call opener.api.do_key_grab(), so you'll want to name your instance "api".
 */
class APIClient {

	/**
	 * Creates an instance of APIClient. Will check for an access token in browser cookie storage.
	 * If no access token is found, it will call this.popup_auth_win(), which opens a popup window
	 * that handles CAS authentication and passes back a temp_key, which can be exchanged for an
	 * access token. Once the APIClient has a token, it will fire an 'ApiReady' event on document.
	 */
	constructor() {
		this.api_url = "https://www.purdue.edu/itap/itpm-ls/labs/api/";
		this.token = fs.readFileSync(__dirname + "/../../../api_token.txt").toString();
	}

	async check_for_token() {
		this.token = Cookies.get('api_token');
		console.log("Cookie is: " + this.token);

		//If there is not an active token stored in the browser, begin process of obtaining a new token
		if(this.token == null) {
			console.log("Running token pull");
			await this.token_pull();
		} else {
			//Dispatch event to let page know APIClient is ready to make calls
			var event = new CustomEvent('ApiReady', {
				detail: {
					status: "ready"
				}
			});
			document.dispatchEvent(event);
		}
	}

	async token_pull() {
		Cookies.remove('api_token', {path: ''});

		var url = window.location.href;
		if(url.indexOf("?temp_key=") < 0) {
			var api_auth = this.api_url + "auth/cas_auth.php";
			var redirect = domain + "/itap/itpm-ls/labs/dashboard/index.php";
			window.location.replace(api_auth + "?redirect=" + redirect);
		} else {
			var temp_key = url.substring(url.indexOf("?temp_key=") + 10);
			history.pushState(null, '', window.location.origin + window.location.pathname);
			var respToken = await this.get_token(temp_key); //Exchange temp_key for an access token
			this.fill_token(respToken.token);

			//Dispatch event to let page know APIClient is ready to make calls
			var event = new CustomEvent('ApiReady', {
				detail: {
					status: "ready"
				}
			});
			document.dispatchEvent(event);
		}
	}

	/**
	 * Places the token into this object and fires an ApiTOKEN event. Also stores the api token into a cookie.
	 * @param {string} token - The string containing the LabsAPI access token. Should start with 'LABS-' and contain 64 randomly generated numbers and/or letters (upper and lowercase)
	 */
	fill_token(token) {
		this.token = token;
		Cookies.set('api_token', token, {expires: 1, path: ''});
	}

	/**
	 * Builds the URL for a specific resource of form: [this.api_url][resource].php
	 * @param {string} resource - The name of the resource to build URL for
	 * @return {string} The proper URL for the endpoint of the given resource
	 */
	buildUrl(resource) {
		return this.api_url + resource;
	}

	/**
	 * Makes a call to auth/get_token.php endpoint to exchange a temporary key for an actual access token to the API. The access token will last 24 hours after retrieval.
	 * @param {string} temp_key_str - The temporary key given to us by the CAS auth popup (see {@link APIClient#do_key_grab}). Passed to get_token to exchange for a token.
	 * @return {Object} an object containing the data section of the server's response messge.
	 */
	async get_token(temp_key_str) {
		try {
			var resp = await axios.post(this.api_url + 'auth/get_token.php', {
				scopes: ["available"],
				temp_key: temp_key_str,
				alias: user_id
			});
			return resp.data;
		} catch (error) {
			console.error(error);
		}
	}

	/**
	 * Opens the CAS authentication popup and stores it in a variable named auth_win (this variable needs to be declared before calling this function)
	 */
	popup_auth_win() {
		auth_win = window.open(this.api_url + 'auth/cas_auth.php', '_blank', "toolbar,scrollbars,resizable,top=100,left=100,width=400,height=400"); //Open Authorization Window
	}

	error_handler(error) {
		if(error.hasOwnProperty("response") && error.response.hasOwnProperty("status") && error.response.status == 401) {
			handleError("A request sent to the Labs API could not be authorized. This is usually due to an expired or outdated token. Would you like to reset your API Token?<br><button style='margin-top: 0.5em;' onclick='ignoreError(this); api.token_pull();'>Reset Token</button><button style='margin-left: 0.5em;' onclick='ignoreError(this);'>Ignore</button>");
		} else {
			if(error.hasOwnProperty("response")) {
				handleError("A request sent to the Labs API returned with an error. Please report this issue to the TSLAs:<br><pre>" + JSON.stringify(error.response, null, 2) + "</pre><br><button style='margin-top: 0.5em;' onclick='copyText(this.parentNode.getElementsByTagName(\"pre\")[0].innerText);'>Copy Error</button><button style='margin-left: 0.5em;' onclick='ignoreError(this);'>Ignore</button>");
			}
			throw error; //Usually happens when the server responds with a non-2xx HTTP response code.
		}
	}

	/**
	 * The get, post, put, and delete methods are provided for ease of access, so that all of these methods can be abstracted
	 * to accept essentially the same parameters. This is only necessary because Axios does not support sending a request body
	 * with a get request, so we must use params instead. For delete, we have to provide the request body to the config of the
	 * Axios function call, because it does not provide a parameter for data on delete. I understand that by using params instead
	 * of a file path for identifying resources, this API does not follow conventional RESTful standards, but I am not sure it's
	 * possible to use a file path for identifying resources in our case because we're using PHP with an Apache server.
	 *
	 * @param resource - The type of resource you want to perform an action on
	 * @param params/data - The request body (should be JSON/JavaScript Object)
	 */

	/**
	 * Used for obtaining information about a specific resource instance or listing instances of a resource. Can be ordered and filtered as well.
	 *
	 * An async wrapper for axios.get(). This function should be placed inside a try/catch block, as it will throw any errors that come
	 * its way. It is not necessary to include an access token in the 'params' object, as it will be added before the API call is made.
	 * It is also worth mentioning that any response code from the server that is not in the 2xx range will be thrown as an error. To see
	 * the server's response in this case, look at 'error.response'. When the server responds, this function will fire an ApiGET event containing
	 * the resource and params passed to it, as well as the server's response.
	 * @param {string} resource - A string containing the name of the resource for which to make a request -- will autmatically be built into a URL.
	 * @param {Object} params - An object containing parameters -- Because this is a GET request, these will be parsed into a query string.
	 * @return {Object} The data section of the LabsAPI server's response
	 */
	async get(resource, params) {
		try {
			params._token = this.token;
			params._api_url = window.location.href;
			var resp = await axios.get(this.buildUrl(resource), { params });
			var event = new CustomEvent('ApiGET', {
				detail: {
					resource_type: resource,
					request_params: params,
					response: resp.data
				}
			});
			document.dispatchEvent(event);
			return resp.data;
		} catch(error) {
			this.error_handler(error);
		}
	}

	/**
	 * Used for creating a new instance of a resource.
	 *
	 * An async wrapper for axios.post(). This function should be placed inside a try/catch block, as it will throw any errors that come
	 * its way. It is not necessary to include an access token in the 'params' object, as it will be added before the API call is made.
	 * It is also worth mentioning that any response code from the server that is not in the 2xx range will be thrown as an error. To see
	 * the server's response in this case, look at 'error.response'. When the server responds, this function will fire an ApiGET event containing
	 * the resource and params passed to it, as well as the server's response.
	 *
	 * @param {string} resource - A string containing the name of the resource for which to make a request -- will autmatically be built into a URL.
	 * @param {Object} params - An object containing parameters
	 * @return {Object} The data section of the LabsAPI server's response
	 */
	async post(resource, data) {
		try {
			data._token = this.token;
			data._api_url = window.location.href;
			var resp = await axios.post(this.buildUrl(resource), data);
			var event = new CustomEvent('ApiPOST', {
				detail: {
					resource_type: resource,
					request_params: data,
					response: resp.data
				}
			});
			document.dispatchEvent(event);
			return resp.data;
		} catch(error) {
			this.error_handler(error);
		}
	}

	async put(resource, data) {
		try {
			data._token = this.token;
			data._api_url = window.location.href;
			var resp = await axios.put(this.buildUrl(resource), data);
			var event = new CustomEvent('ApiPUT', {
				detail: {
					resource_type: resource,
					request_params: data,
					response: resp.data
				}
			});
			document.dispatchEvent(event);
			return resp.data;
		} catch(error) {
			this.error_handler(error);
		}
	}

	async delete(resource, data) {
		try {
			data._token = this.token;
			data._api_url = window.location.href;
			var resp = await axios.delete(this.buildUrl(resource), { data });
			var event = new CustomEvent('ApiDELETE', {
				detail: {
					resource_type: resource,
					request_params: data,
					response: resp.data
				}
			});
			document.dispatchEvent(event);
			return resp.data;
		} catch(error) {
			this.error_handler(error);
		}
	}
}

module.exports = APIClient;
