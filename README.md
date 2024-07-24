# Aserto inbound authorization policy for Zuplo

## Options

```ts
type AsertoPolicyOptions = {
  // required
  tenantId: string
  authorizerApiKey: string
  policyName: string

  // required if using api-auth template
  serviceName: string

  // required if not using api-auth template
  objectType: string
  objectId: string
  relation: string
}
```

## User context

Authorization happens downstream from authentication, so the Aserto authorization policy assumes that an authentication policy precedes it. 

The subject of the authorization request is assumed to be found in `request.user.data.sub`.

## Required parameters

* `tenantId`: the tenant ID of the Aserto account or organization
* `authorizerApiKey`: API key of the Aserto hosted authorizer
* `policyName`: policy name (typically `api-auth` if using the API Authorization template)

## Configuration using the API Authorization template

If you're using the API authorization template, the only additional required parameter is:

* `serviceName`: name of the OpenAPI service imported into Aserto. For example, the Todo API Service gets imported with a service name of `todo`.

### How the authorization call is constructed

If you're using the API authorization template, the Aserto policy used is `policy.rebac`, and is called with the following resource context:

```json
{
  "object_type": "endpoint",
  "object_id": `${serviceName}:${httpMethod}:${routePath}`,
  "relation": "can_invoke"
})
```

`${serviceName}:${httpMethod}:${routePath}` is constructed in the following way:

* `serviceName`: required option in the `AsertoPolicyOptions`
* `httpMethod`: automatically extracted from the request
* `routePath`: automatically extracted from the request

## Advanced / custom configuration

You can override any of the resource context fields via the following parameters. If `serviceName` is not supplied, these parameters become required.

* `objectType`
* `objectId`
* `relation`

Each of these values can be in the following formats:
1. "string": string literal
2. "$header(HEADER_NAME)": retrieve the value of request.headers[HEADER_NAME]
3. "$param(PARAM_NAME)": retrieve the value of request.params[PARAM_NAME]
4. "$body(BODY_KEY_NAME)": retrieve the value of request.body[BODY_KEY_NAME] (this assumes a JSON body and can be a compound - like x.y.z)

### Example

For a URL template that looks like this:

`PUT /todos/{todoId}`

And a request that looks like this:

```
PUT /todos/1 HTTP/1.1
Host: myapi.com
Authorization: Bearer <myoauthtoken>
My-Custom-Header: can_put

{
  "resource": {
    "type": "todo",
    "id": "1"
  }
}
```

The following option values:
```typescript
{
  objectType: "$body(resource.type)",
  objectId: "$params(todoId)",
  relation: "$header(My-Custom-Header)"
}
```

Will result in the following resource context:
```json
{
  "object_type": "todo",
  "object_id": "1",
  "relation": "can_put"
}
```

## Support

Questions? Join the [Aserto Slack Community](https://aserto.com/slack).
