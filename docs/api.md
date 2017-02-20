# Firefox Accounts authentication server API
<!--begin-abstract-->
This document provides protocol-level details
of the Firefox Accounts Server API.
For a prose description of the client/server protocol
and details on how each parameter is derived
see the [API design document](https://wiki.mozilla.org/Identity/AttachedServices/KeyServerProtocol).
<!--end-abstract-->
* [Overview](#overview)
  * [URL structure](#url-structure)
  * [Request format](#request-format)
  * [Response format](#response-format)
    * [Defined errors](#defined-errors)
    * [Responses from intermediary servers](#responses-from-intermediary-servers)
  * [Validation](#validation)
* [API endpoints](#api-endpoints)
  * [Account](#account)
    * [POST /account/create](#post-accountcreate)
    * [POST /account/login](#post-accountlogin)
    * [GET /account/status :lock::question: sessionToken](#get-accountstatus)
    * [POST /account/status](#post-accountstatus)
    * [GET /account/profile :lock::question: sessionToken, oauthToken](#get-accountprofile)
    * [GET /account/keys :lock: keyFetchToken](#get-accountkeys)
    * [POST /account/device :lock: sessionToken](#post-accountdevice)
    * [POST /account/devices/notify :lock: sessionToken](#post-accountdevicesnotify)
    * [GET /account/devices :lock: sessionToken](#get-accountdevices)
    * [GET /account/sessions :lock: sessionToken](#get-accountsessions)
    * [POST /account/device/destroy :lock: sessionToken](#post-accountdevicedestroy)
    * [GET /recovery_email/status :lock: sessionToken](#get-recovery_emailstatus)
    * [POST /recovery_email/resend_code :lock: sessionToken](#post-recovery_emailresend_code)
    * [POST /recovery_email/verify_code](#post-recovery_emailverify_code)
    * [POST /account/unlock/resend_code](#post-accountunlockresend_code)
    * [POST /account/unlock/verify_code](#post-accountunlockverify_code)
    * [POST /account/login/send_unblock_code](#post-accountloginsend_unblock_code)
    * [POST /account/login/reject_unblock_code](#post-accountloginreject_unblock_code)
    * [POST /account/reset :lock: accountResetToken](#post-accountreset)
    * [POST /account/destroy](#post-accountdestroy)
  * [Password](#password)
    * [POST /password/change/start](#post-passwordchangestart)
    * [POST /password/change/finish :lock: passwordChangeToken](#post-passwordchangefinish)
    * [POST /password/forgot/send_code](#post-passwordforgotsend_code)
    * [POST /password/forgot/resend_code :lock: passwordForgotToken](#post-passwordforgotresend_code)
    * [POST /password/forgot/verify_code :lock: passwordForgotToken](#post-passwordforgotverify_code)
    * [GET /password/forgot/status :lock: passwordForgotToken](#get-passwordforgotstatus)
  * [Session](#session)
    * [POST /session/destroy :lock: sessionToken](#post-sessiondestroy)
    * [GET /session/status :lock: sessionToken](#get-sessionstatus)
  * [Sign](#sign)
    * [POST /certificate/sign :lock: sessionToken](#post-certificatesign)
  * [Sms](#sms)
    * [POST /sms :lock: sessionToken](#post-sms)
    * [GET /sms/status :lock: sessionToken](#get-smsstatus)
  * [Util](#util)
    * [POST /get_random_bytes](#post-get_random_bytes)
    * [GET /verify_email](#get-verify_email)
    * [GET /complete_reset_password](#get-complete_reset_password)
* [Example flows](#example-flows)
* [Back-off protocol](#back-off-protocol)
* [Reference client](#reference-client)

## Overview

### URL structure
<!--begin-url-structure-->
All requests use URLs of the form:

```
https://<base-URI>/v1/<endpoint-path>
```

Note that:

* All API access must be over a properly-validated HTTPS connection.
* The URL embeds a version identifier `v1`.
  Future revisions of this API may introduce new version numbers.
* The base URI of the server may be configured on a per-client basis:
  * For a list of development servers
    see [Firefox Accounts deployments on MDN](https://developer.mozilla.org/en-US/Firefox_Accounts#Firefox_Accounts_deployments).
  * The canonical URL for Mozilla's hosted Firefox Accounts server
    is `https://api.accounts.firefox.com/v1`.
<!--end-url-structure-->

### Request format
<!--begin-request-format-->
Requests that require authentication
use [Hawk](https://github.com/hueniverse/hawk) request signatures.
These endpoints are marked
with a :lock: icon.
Where the authentication is optional,
there will also be a :question: icon.

All POST requests must have a content-type of `application/json`
with a UTF8-encoded JSON body
and must specify the content-length header.
Keys and other binary data are included in the JSON
as hexadecimal strings.

The following request headers may be specified
to influence the behaviour of the server:

* `Accept-Language`
  may be used to localize
  emails and SMS messages.
<!--end-request-format-->

### Response format
<!--begin-response-format-->
All requests receive
a JSON response body
with a `Content-Type: application/json` header
and appropriate `Content-Length` set.
The body structure
depends on the endpoint returning it.

Successful responses will have
an HTTP status code of 200
and a `Timestamp` header
that contains the current server time
in seconds since the epoch.

Error responses caused by invalid client behaviour
will have an HTTP status code in the 4xx range.
Error responses caused by server-side problems
will have an HTTP status code in the 5xx range.
Failures due to invalid behavior from the client

To simplify error handling for the client,
the type of error is indicated by both
a defined HTTP status code
and an application-specific `errno` in the body.
For example:

```js
{
  "code": 400,  // Matches the HTTP status code
  "errno": 107, // Stable application-level error number
  "error": "Bad Request", // String description of the error type
  "message": "Invalid parameter in request body", // Specific error message
  "info": "https://docs.dev.lcip.og/errors/1234"  // Link to more information
}
```

Responses for some errors may include additional parameters.
<!--end-response-format-->

#### Defined errors

The currently-defined values
for `code` and `errno` are:

* `code: 400, errno: 100`:
  Incorrect Database Patch Level
* `code: 400, errno: 101`:
  Account already exists
* `code: 400, errno: 102`:
  Unknown account
* `code: 400, errno: 103`:
  Incorrect password
* `code: 400, errno: 104`:
  Unverified account
* `code: 400, errno: 105`:
  Invalid verification code
* `code: 400, errno: 106`:
  Invalid JSON in request body
* `code: 400, errno: 107`:
  Invalid parameter in request body
* `code: 400, errno: 108`:
  Missing parameter in request body
* `code: 401, errno: 109`:
  Invalid request signature
* `code: 401, errno: 110`:
  Invalid authentication token in request signature
* `code: 401, errno: 111`:
  Invalid timestamp in request signature
* `code: 411, errno: 112`:
  Missing content-length header
* `code: 413, errno: 113`:
  Request body too large
* `code: 429, errno: 114`:
  Client has sent too many requests
* `code: 401, errno: 115`:
  Invalid nonce in request signature
* `code: 410, errno: 116`:
  This endpoint is no longer supported
* `code: 400, errno: 120`:
  Incorrect email case
* `code: 400, errno: 123`:
  Unknown device
* `code: 400, errno: 124`:
  Session already registered by another device
* `code: 400, errno: 125`:
  The request was blocked for security reasons
* `code: 400, errno: 126`:
  Account must be reset
* `code: 400, errno: 127`:
  Invalid unblock code
* `code: 400, errno: 129`:
  Invalid phone number
* `code: 400, errno: 130`:
  Invalid region
* `code: 400, errno: 131`:
  Invalid message id
* `code: 500, errno: 132`:
  Message rejected
* `code: 503, errno: 201`:
  Service unavailable
* `code: 503, errno: 202`:
  Feature not enabled
* `code: 500, errno: 999`:
  Unspecified error

The following errors
include additional response properties:

* `errno: 100`: level, levelRequired
* `errno: 101`: email
* `errno: 102`: email
* `errno: 103`: email
* `errno: 105`
* `errno: 107`: validation
* `errno: 108`: param
* `errno: 111`: serverTime
* `errno: 114`
* `errno: 120`: email
* `errno: 125`
* `errno: 126`: email
* `errno: 130`: region
* `errno: 132`: reason, reasonCode
* `errno: 201`: retryAfter
* `errno: 202`: retryAfter

#### Responses from intermediary servers
<!--begin-responses-from-intermediary-servers-->
As with any HTTP-based API,
clients must handle standard errors that may be returned
by proxies, load-balancers or other intermediary servers.
These non-application responses can be identified
by the absence of a correctly-formatted JSON response body.

Common examples include:

* `413 Request Entity Too Large`:
  may be returned by an upstream proxy server.
* `502 Gateway Timeout`:
  may be returned if a load-balancer can't connect to application servers.
<!--end-responses-from-intermediary-servers-->

### Validation

In the documentation that follows,
some properties of requests and responses
are validated by common code
that has been refactored and extracted.
For reference,
those common validations are defined here.

#### lib/routes/validators

* `HEX_STRING: /^(?:[a-fA-F0-9]{2})+$/`
* `BASE64_JWT: /^(?:[a-zA-Z0-9-_]+[=]{0,2}\.){2}[a-zA-Z0-9-_]+[=]{0,2}$/`
* `URLSAFEBASE64: /^[a-zA-Z0-9-_]*$/`
* `BASE_36: /^[a-zA-Z0-9]*$/`
* `DISPLAY_SAFE_UNICODE: /^(?:[^\u0000-\u001F\u007F\u0080-\u009F\u2028-\u2029\uD800-\uDFFF\uE000-\uF8FF\uFFF9-\uFFFF])*$/`
* `service: isA.string.max(16).regex(/^[a-zA-Z0-9\-]*$/g)`
* `E164_NUMBER: /^\+[1-9]\d{1,14}$/`

#### lib/metrics/context

* `schema: isA.object({ flowId: isA.string.length(64).regex(HEX_STRING).optional, flowBeginTime: isA.number.integer.positive.optional }).unknown(false).and(flowId, flowBeginTime).optional`

## API endpoints

### Account

#### POST /account/create
<!---begin-route-post-accountcreate-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `keys: isA.boolean.optional`
  <!--begin-query-param-post-accountcreate-keys-->TODO: description goes here<!--end-query-param-->
* `service: validators.service`
  <!--begin-query-param-post-accountcreate-service-->TODO: description goes here<!--end-query-param-->
* `_createdAt: isA.number.min(0).optional`
  <!--begin-query-param-post-accountcreate-_createdAt-->TODO: description goes here<!--end-query-param-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-accountcreate-email-->TODO: description goes here<!--end-request-body-->
* `authPW: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-accountcreate-authPW-->TODO: description goes here<!--end-request-body-->
* `preVerified: isA.boolean`
  <!--begin-request-body-post-accountcreate-preVerified-->TODO: description goes here<!--end-request-body-->
* `service: validators.service`
  <!--begin-request-body-post-accountcreate-service-->TODO: description goes here<!--end-request-body-->
* `redirectTo: validators.redirectTo(config.smtp.redirectDomain).optional`
  <!--begin-request-body-post-accountcreate-redirectTo-->TODO: description goes here<!--end-request-body-->
* `resume: isA.string.max(2048).optional`
  <!--begin-request-body-post-accountcreate-resume-->TODO: description goes here<!--end-request-body-->
* `preVerifyToken: isA.string.max(2048).regex(BASE64_JWT).optional`
  <!--begin-request-body-post-accountcreate-preVerifyToken-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-accountcreate-metricsContext-->TODO: description goes here<!--end-request-body-->

##### Response body

* `uid: isA.string.regex(HEX_STRING).required`
  <!--begin-response-body-post-accountcreate-uid-->TODO: description goes here<!--end-response-body-->
* `sessionToken: isA.string.regex(HEX_STRING).required`
  <!--begin-response-body-post-accountcreate-sessionToken-->TODO: description goes here<!--end-response-body-->
* `keyFetchToken: isA.string.regex(HEX_STRING).optional`
  <!--begin-response-body-post-accountcreate-keyFetchToken-->TODO: description goes here<!--end-response-body-->
* `authAt: isA.number.integer`
  <!--begin-response-body-post-accountcreate-authAt-->TODO: description goes here<!--end-response-body-->



#### POST /account/login
<!---begin-route-post-accountlogin-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `keys: isA.boolean.optional`
  <!--begin-query-param-post-accountlogin-keys-->TODO: description goes here<!--end-query-param-->
* `service: validators.service`
  <!--begin-query-param-post-accountlogin-service-->TODO: description goes here<!--end-query-param-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-accountlogin-email-->TODO: description goes here<!--end-request-body-->
* `authPW: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-accountlogin-authPW-->TODO: description goes here<!--end-request-body-->
* `service: validators.service`
  <!--begin-request-body-post-accountlogin-service-->TODO: description goes here<!--end-request-body-->
* `redirectTo: isA.string.uri.optional`
  <!--begin-request-body-post-accountlogin-redirectTo-->TODO: description goes here<!--end-request-body-->
* `resume: isA.string.optional`
  <!--begin-request-body-post-accountlogin-resume-->TODO: description goes here<!--end-request-body-->
* `reason: isA.string.max(16).optional`
  <!--begin-request-body-post-accountlogin-reason-->TODO: description goes here<!--end-request-body-->
* `unblockCode: isA.string.regex(BASE_36).length(unblockCodeLen).optional`
  <!--begin-request-body-post-accountlogin-unblockCode-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-accountlogin-metricsContext-->TODO: description goes here<!--end-request-body-->

##### Response body

* `uid: isA.string.regex(HEX_STRING).required`
  <!--begin-response-body-post-accountlogin-uid-->TODO: description goes here<!--end-response-body-->
* `sessionToken: isA.string.regex(HEX_STRING).required`
  <!--begin-response-body-post-accountlogin-sessionToken-->TODO: description goes here<!--end-response-body-->
* `keyFetchToken: isA.string.regex(HEX_STRING).optional`
  <!--begin-response-body-post-accountlogin-keyFetchToken-->TODO: description goes here<!--end-response-body-->
* `verificationMethod: isA.string.optional`
  <!--begin-response-body-post-accountlogin-verificationMethod-->TODO: description goes here<!--end-response-body-->
* `verificationReason: isA.string.optional`
  <!--begin-response-body-post-accountlogin-verificationReason-->TODO: description goes here<!--end-response-body-->
* `verified: isA.boolean.required`
  <!--begin-response-body-post-accountlogin-verified-->TODO: description goes here<!--end-response-body-->
* `authAt: isA.number.integer`
  <!--begin-response-body-post-accountlogin-authAt-->TODO: description goes here<!--end-response-body-->
* `emailSent: isA.boolean.optional`
  <!--begin-response-body-post-accountlogin-emailSent-->TODO: description goes here<!--end-response-body-->



#### GET /account/status

:lock::question: Optionally HAWK-authenticated with session token
<!---begin-route-get-accountstatus-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `uid: isA.string.min(32).max(32).regex(validators.HEX_STRING)`
  <!--begin-query-param-get-accountstatus-uid-->TODO: description goes here<!--end-query-param-->



#### POST /account/status
<!---begin-route-post-accountstatus-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-accountstatus-email-->TODO: description goes here<!--end-request-body-->

##### Response body

* `exists: isA.boolean.required`
  <!--begin-response-body-post-accountstatus-exists-->TODO: description goes here<!--end-response-body-->



#### GET /account/profile

:lock::question: Optionally authenticated with OAuth bearer token, or HAWK-authenticated with session token
<!---begin-route-get-accountprofile-->
TODO: Description goes here

<!--end-route-->



#### GET /account/keys

:lock: HAWK-authenticated with key fetch token
<!---begin-route-get-accountkeys-->
TODO: Description goes here

<!--end-route-->

##### Response body

* `bundle: isA.string.regex(validators.HEX_STRING)`
  <!--begin-response-body-get-accountkeys-bundle-->TODO: description goes here<!--end-response-body-->



#### POST /account/device

:lock: HAWK-authenticated with session token
<!---begin-route-post-accountdevice-->
TODO: Description goes here

<!--end-route-->



#### POST /account/devices/notify

:lock: HAWK-authenticated with session token
<!---begin-route-post-accountdevicesnotify-->
TODO: Description goes here

<!--end-route-->



#### GET /account/devices

:lock: HAWK-authenticated with session token
<!---begin-route-get-accountdevices-->
TODO: Description goes here

<!--end-route-->



#### GET /account/sessions

:lock: HAWK-authenticated with session token
<!---begin-route-get-accountsessions-->
TODO: Description goes here

<!--end-route-->



#### POST /account/device/destroy

:lock: HAWK-authenticated with session token
<!---begin-route-post-accountdevicedestroy-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `id: isA.string.length(32).regex(HEX_STRING).required`
  <!--begin-request-body-post-accountdevicedestroy-id-->TODO: description goes here<!--end-request-body-->



#### GET /recovery_email/status

:lock: HAWK-authenticated with session token
<!---begin-route-get-recovery_emailstatus-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `reason: isA.string.max(16).optional`
  <!--begin-query-param-get-recovery_emailstatus-reason-->TODO: description goes here<!--end-query-param-->

##### Response body

* `email: isA.string.required`
  <!--begin-response-body-get-recovery_emailstatus-email-->TODO: description goes here<!--end-response-body-->
* `verified: isA.boolean.required`
  <!--begin-response-body-get-recovery_emailstatus-verified-->TODO: description goes here<!--end-response-body-->
* `sessionVerified: isA.boolean.optional`
  <!--begin-response-body-get-recovery_emailstatus-sessionVerified-->TODO: description goes here<!--end-response-body-->
* `emailVerified: isA.boolean.optional`
  <!--begin-response-body-get-recovery_emailstatus-emailVerified-->TODO: description goes here<!--end-response-body-->



#### POST /recovery_email/resend_code

:lock: HAWK-authenticated with session token
<!---begin-route-post-recovery_emailresend_code-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `service: validators.service`
  <!--begin-query-param-post-recovery_emailresend_code-service-->TODO: description goes here<!--end-query-param-->

##### Request body

* `service: validators.service`
  <!--begin-request-body-post-recovery_emailresend_code-service-->TODO: description goes here<!--end-request-body-->
* `redirectTo: validators.redirectTo(config.smtp.redirectDomain).optional`
  <!--begin-request-body-post-recovery_emailresend_code-redirectTo-->TODO: description goes here<!--end-request-body-->
* `resume: isA.string.max(2048).optional`
  <!--begin-request-body-post-recovery_emailresend_code-resume-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-recovery_emailresend_code-metricsContext-->TODO: description goes here<!--end-request-body-->



#### POST /recovery_email/verify_code
<!---begin-route-post-recovery_emailverify_code-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `service: validators.service`
  <!--begin-query-param-post-recovery_emailverify_code-service-->TODO: description goes here<!--end-query-param-->
* `reminder: isA.string.max(32).alphanum.optional`
  <!--begin-query-param-post-recovery_emailverify_code-reminder-->TODO: description goes here<!--end-query-param-->

##### Request body

* `uid: isA.string.max(32).regex(HEX_STRING).required`
  <!--begin-request-body-post-recovery_emailverify_code-uid-->TODO: description goes here<!--end-request-body-->
* `code: isA.string.min(32).max(32).regex(HEX_STRING).required`
  <!--begin-request-body-post-recovery_emailverify_code-code-->TODO: description goes here<!--end-request-body-->
* `service: validators.service`
  <!--begin-request-body-post-recovery_emailverify_code-service-->TODO: description goes here<!--end-request-body-->
* `reminder: isA.string.max(32).alphanum.optional`
  <!--begin-request-body-post-recovery_emailverify_code-reminder-->TODO: description goes here<!--end-request-body-->



#### POST /account/unlock/resend_code
<!---begin-route-post-accountunlockresend_code-->
TODO: Description goes here

<!--end-route-->



#### POST /account/unlock/verify_code
<!---begin-route-post-accountunlockverify_code-->
TODO: Description goes here

<!--end-route-->



#### POST /account/login/send_unblock_code
<!---begin-route-post-accountloginsend_unblock_code-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-accountloginsend_unblock_code-email-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-accountloginsend_unblock_code-metricsContext-->TODO: description goes here<!--end-request-body-->



#### POST /account/login/reject_unblock_code
<!---begin-route-post-accountloginreject_unblock_code-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `uid: isA.string.max(32).regex(HEX_STRING).required`
  <!--begin-request-body-post-accountloginreject_unblock_code-uid-->TODO: description goes here<!--end-request-body-->
* `unblockCode: isA.string.regex(BASE_36).length(unblockCodeLen).required`
  <!--begin-request-body-post-accountloginreject_unblock_code-unblockCode-->TODO: description goes here<!--end-request-body-->



#### POST /account/reset

:lock: HAWK-authenticated with account reset token
<!---begin-route-post-accountreset-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `keys: isA.boolean.optional`
  <!--begin-query-param-post-accountreset-keys-->TODO: description goes here<!--end-query-param-->

##### Request body

* `authPW: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-accountreset-authPW-->TODO: description goes here<!--end-request-body-->
* `sessionToken: isA.boolean.optional`
  <!--begin-request-body-post-accountreset-sessionToken-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-accountreset-metricsContext-->TODO: description goes here<!--end-request-body-->



#### POST /account/destroy
<!---begin-route-post-accountdestroy-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-accountdestroy-email-->TODO: description goes here<!--end-request-body-->
* `authPW: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-accountdestroy-authPW-->TODO: description goes here<!--end-request-body-->



### Password

#### POST /password/change/start
<!---begin-route-post-passwordchangestart-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-passwordchangestart-email-->TODO: description goes here<!--end-request-body-->
* `oldAuthPW: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-passwordchangestart-oldAuthPW-->TODO: description goes here<!--end-request-body-->



#### POST /password/change/finish

:lock: HAWK-authenticated with password change token
<!---begin-route-post-passwordchangefinish-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `keys: isA.boolean.optional`
  <!--begin-query-param-post-passwordchangefinish-keys-->TODO: description goes here<!--end-query-param-->

##### Request body

* `authPW: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-passwordchangefinish-authPW-->TODO: description goes here<!--end-request-body-->
* `wrapKb: isA.string.min(64).max(64).regex(HEX_STRING).required`
  <!--begin-request-body-post-passwordchangefinish-wrapKb-->TODO: description goes here<!--end-request-body-->
* `sessionToken: isA.string.min(64).max(64).regex(HEX_STRING).optional`
  <!--begin-request-body-post-passwordchangefinish-sessionToken-->TODO: description goes here<!--end-request-body-->



#### POST /password/forgot/send_code
<!---begin-route-post-passwordforgotsend_code-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `service: validators.service`
  <!--begin-query-param-post-passwordforgotsend_code-service-->TODO: description goes here<!--end-query-param-->
* `keys: isA.boolean.optional`
  <!--begin-query-param-post-passwordforgotsend_code-keys-->TODO: description goes here<!--end-query-param-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-passwordforgotsend_code-email-->TODO: description goes here<!--end-request-body-->
* `service: validators.service`
  <!--begin-request-body-post-passwordforgotsend_code-service-->TODO: description goes here<!--end-request-body-->
* `redirectTo: validators.redirectTo(redirectDomain).optional`
  <!--begin-request-body-post-passwordforgotsend_code-redirectTo-->TODO: description goes here<!--end-request-body-->
* `resume: isA.string.max(2048).optional`
  <!--begin-request-body-post-passwordforgotsend_code-resume-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-passwordforgotsend_code-metricsContext-->TODO: description goes here<!--end-request-body-->

##### Response body

* `passwordForgotToken: isA.string`
  <!--begin-response-body-post-passwordforgotsend_code-passwordForgotToken-->TODO: description goes here<!--end-response-body-->
* `ttl: isA.number`
  <!--begin-response-body-post-passwordforgotsend_code-ttl-->TODO: description goes here<!--end-response-body-->
* `codeLength: isA.number`
  <!--begin-response-body-post-passwordforgotsend_code-codeLength-->TODO: description goes here<!--end-response-body-->
* `tries: isA.number`
  <!--begin-response-body-post-passwordforgotsend_code-tries-->TODO: description goes here<!--end-response-body-->



#### POST /password/forgot/resend_code

:lock: HAWK-authenticated with password forgot token
<!---begin-route-post-passwordforgotresend_code-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `service: validators.service`
  <!--begin-query-param-post-passwordforgotresend_code-service-->TODO: description goes here<!--end-query-param-->

##### Request body

* `email: validators.email.required`
  <!--begin-request-body-post-passwordforgotresend_code-email-->TODO: description goes here<!--end-request-body-->
* `service: validators.service`
  <!--begin-request-body-post-passwordforgotresend_code-service-->TODO: description goes here<!--end-request-body-->
* `redirectTo: validators.redirectTo(redirectDomain).optional`
  <!--begin-request-body-post-passwordforgotresend_code-redirectTo-->TODO: description goes here<!--end-request-body-->
* `resume: isA.string.max(2048).optional`
  <!--begin-request-body-post-passwordforgotresend_code-resume-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-passwordforgotresend_code-metricsContext-->TODO: description goes here<!--end-request-body-->

##### Response body

* `passwordForgotToken: isA.string`
  <!--begin-response-body-post-passwordforgotresend_code-passwordForgotToken-->TODO: description goes here<!--end-response-body-->
* `ttl: isA.number`
  <!--begin-response-body-post-passwordforgotresend_code-ttl-->TODO: description goes here<!--end-response-body-->
* `codeLength: isA.number`
  <!--begin-response-body-post-passwordforgotresend_code-codeLength-->TODO: description goes here<!--end-response-body-->
* `tries: isA.number`
  <!--begin-response-body-post-passwordforgotresend_code-tries-->TODO: description goes here<!--end-response-body-->



#### POST /password/forgot/verify_code

:lock: HAWK-authenticated with password forgot token
<!---begin-route-post-passwordforgotverify_code-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `code: isA.string.min(32).max(32).regex(HEX_STRING).required`
  <!--begin-request-body-post-passwordforgotverify_code-code-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-passwordforgotverify_code-metricsContext-->TODO: description goes here<!--end-request-body-->

##### Response body

* `accountResetToken: isA.string`
  <!--begin-response-body-post-passwordforgotverify_code-accountResetToken-->TODO: description goes here<!--end-response-body-->



#### GET /password/forgot/status

:lock: HAWK-authenticated with password forgot token
<!---begin-route-get-passwordforgotstatus-->
TODO: Description goes here

<!--end-route-->

##### Response body

* `tries: isA.number`
  <!--begin-response-body-get-passwordforgotstatus-tries-->TODO: description goes here<!--end-response-body-->
* `ttl: isA.number`
  <!--begin-response-body-get-passwordforgotstatus-ttl-->TODO: description goes here<!--end-response-body-->



### Session

#### POST /session/destroy

:lock: HAWK-authenticated with session token
<!---begin-route-post-sessiondestroy-->
TODO: Description goes here

<!--end-route-->



#### GET /session/status

:lock: HAWK-authenticated with session token
<!---begin-route-get-sessionstatus-->
TODO: Description goes here

<!--end-route-->



### Sign

#### POST /certificate/sign

:lock: HAWK-authenticated with session token
<!---begin-route-post-certificatesign-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `service: validators.service`
  <!--begin-query-param-post-certificatesign-service-->TODO: description goes here<!--end-query-param-->

##### Request body

* `publicKey: isA.object({ algorithm: isA.string.valid(RS, DS).required, n: isA.string, e: isA.string, y: isA.string, p: isA.string, q: isA.string, g: isA.string, version: isA.string }).required`
  <!--begin-request-body-post-certificatesign-publicKey-->TODO: description goes here<!--end-request-body-->
* `duration: isA.number.integer.min(0).max().required`
  <!--begin-request-body-post-certificatesign-duration-->TODO: description goes here<!--end-request-body-->



### Sms

#### POST /sms

:lock: HAWK-authenticated with session token
<!---begin-route-post-sms-->
TODO: Description goes here

<!--end-route-->

##### Request body

* `phoneNumber: isA.string.regex(validators.E164_NUMBER).required`
  <!--begin-request-body-post-sms-phoneNumber-->TODO: description goes here<!--end-request-body-->
* `messageId: isA.number.positive.required`
  <!--begin-request-body-post-sms-messageId-->TODO: description goes here<!--end-request-body-->
* `metricsContext: require(../metrics/context).schema`
  <!--begin-request-body-post-sms-metricsContext-->TODO: description goes here<!--end-request-body-->



#### GET /sms/status

:lock: HAWK-authenticated with session token
<!---begin-route-get-smsstatus-->
TODO: Description goes here

<!--end-route-->



### Util

#### POST /get_random_bytes
<!---begin-route-post-get_random_bytes-->
TODO: Description goes here

<!--end-route-->



#### GET /verify_email
<!---begin-route-get-verify_email-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `code: isA.string.max(32).regex(HEX_STRING).required`
  <!--begin-query-param-get-verify_email-code-->TODO: description goes here<!--end-query-param-->
* `uid: isA.string.max(32).regex(HEX_STRING).required`
  <!--begin-query-param-get-verify_email-uid-->TODO: description goes here<!--end-query-param-->
* `service: isA.string.max(16).alphanum.optional`
  <!--begin-query-param-get-verify_email-service-->TODO: description goes here<!--end-query-param-->
* `redirectTo: validators.redirectTo(redirectDomain).optional`
  <!--begin-query-param-get-verify_email-redirectTo-->TODO: description goes here<!--end-query-param-->



#### GET /complete_reset_password
<!---begin-route-get-complete_reset_password-->
TODO: Description goes here

<!--end-route-->

##### Query parameters

* `email: validators.email.required`
  <!--begin-query-param-get-complete_reset_password-email-->TODO: description goes here<!--end-query-param-->
* `code: isA.string.max(32).regex(HEX_STRING).required`
  <!--begin-query-param-get-complete_reset_password-code-->TODO: description goes here<!--end-query-param-->
* `token: isA.string.max(64).regex(HEX_STRING).required`
  <!--begin-query-param-get-complete_reset_password-token-->TODO: description goes here<!--end-query-param-->
* `service: isA.string.max(16).alphanum.optional`
  <!--begin-query-param-get-complete_reset_password-service-->TODO: description goes here<!--end-query-param-->
* `redirectTo: validators.redirectTo(redirectDomain).optional`
  <!--begin-query-param-get-complete_reset_password-redirectTo-->TODO: description goes here<!--end-query-param-->



## Back-off protocol
<!--begin-back-off-protocol-->
During periods of heavy load,
the server may request that clients enter a "back-off" state,
in which they avoid making further requests.

At such times,
it will return a `503 Service Unavailable` response
with a `Retry-After` header denoting the number of seconds to wait
before issuing any further requests.
It will also include `errno: 201`
and a `retryAfter` field
matching the value of the `Retry-After` header
in the body.

For example,
the following response indicates that the client
should suspend making further requests
for 30 seconds:

```
HTTP/1.1 503 Service Unavailable
Retry-After: 30
Content-Type: application/json

{
  "code": 503,
  "errno": 201,
  "error": "Service Unavailable",
  "message": "Service unavailable",
  "info": "https://github.com/mozilla/fxa-auth-server/blob/master/docs/api.md#response-format",
  "retryAfter": 30,
  "retryAfterLocalized": "in a few seconds"
}
```
<!--end-back-off-protocol-->

## Reference client
<!--begin-reference-client-->
https://github.com/mozilla/fxa-js-client
<!--end-reference-client-->
