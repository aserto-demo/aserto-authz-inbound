import { HttpProblems, ZuploContext, ZuploRequest } from "@zuplo/runtime"

type AsertoPolicyOptions = {
  // Aserto hosted authorizer configuration values (required)
  tenantId: string
  authorizerApiKey: string
  policyName: string
  
  // Canonicalized service name (required unless all the overrides below are provided)
  serviceName: string

  // The default behavior is to call the Aserto authorizer with the following check call:
  //   objectType: "endpoint"
  //   objectId: `${serviceName}:${httpMethod}:${routePath}`
  //   relation: "can_invoke"
  // Each of these can be overridden by providing explicit values for these.
  // The values can be in the following formats:
  //   1. "string": string literal
  //   2. "$header(HEADER_NAME)": retrieve the value of request.headers[HEADER_NAME]
  //   3. "$param(PARAM_NAME)": retrieve the value of request.params[PARAM_NAME]
  //   4. "$body(BODY_KEY_NAME)": retrieve the value of request.body[BODY_KEY_NAME] (this assumes a JSON body and can be a compound - like x.y.z)
  objectType: string
  objectId: string
  relation: string
}

const ASERTO_AUTHORIZER_URL = "https://authorizer.prod.aserto.com/api/v2/authz/is"
const HEADER = "$header("
const PARAM = "$param("
const BODY = "$body("

async function getValue(request: ZuploRequest, value: string): Promise<string> {
  if (!value) {
    return ''
  }
  if (value.startsWith(HEADER)) {
    const header = value.substring(HEADER.length, value.length - 1)
    return request.headers[header]
  }
  if (value.startsWith(PARAM)) {
    const param = value.substring(PARAM.length, value.length - 1)
    return request.params[param]
  }
  if (value.startsWith(BODY)) {
    const bodyPath = value.substring(BODY.length, value.length - 1)
    const bodyPathComponents = bodyPath.split('.')
    let body = await request.json() 
    for (const pathComponent of bodyPathComponents) {
      body = body[pathComponent]
    }
    return body
  }
  return value
}

function getCanonicalizedEndpointID(request: ZuploRequest, context: ZuploContext, serviceName: string): string {
  return `${serviceName}:${request.method}:${context.route.path}`
}

export default async function policy(
  request: ZuploRequest,
  context: ZuploContext,
  options: AsertoPolicyOptions,
  policyName: string
) {

  if (!request.user) {
    context.log.error(
      "User is not authenticated. An authentication policy must come before the authorization policy.",
    );
    return HttpProblems.unauthorized(request, context);
  }

  const endpointID = getCanonicalizedEndpointID(request, context, options.serviceName)

  const asertoRequest = JSON.stringify({
    "identity_context": {
      "type": "IDENTITY_TYPE_SUB",
      "identity": request.user.data.sub
    },
    "resource_context": {
      "object_type": await getValue(request, options.objectType) ?? "endpoint",
      "object_id": await getValue(request, options.objectId) ?? endpointID,
      "relation": await getValue(request, options.relation) ?? "can_invoke"
    },
    "policy_context": {
      "decisions": [
        "allowed"
      ],
      "path": "rebac.check"
    },
    "policy_instance": {
      "name": options.policyName,
      "instance_label": options.policyName
    }
  })

  try {
    context.log.debug(`rebac.check request: ${asertoRequest}`)

    const asertoResponse = await fetch(ASERTO_AUTHORIZER_URL, { 
      headers: {
        "content-type": "application/json",
        "Aserto-Tenant-ID": options.tenantId,
        "Authorization": `basic ${options.authorizerApiKey}`
      },
      method: 'POST',
      body: asertoRequest
    })
    const response = await asertoResponse.json()
    context.log.debug(`aserto response: ${JSON.stringify(response)}`)

    if (response && response.decisions && response.decisions.length > 0 && response.decisions[0].is) {
      return request
    }
    context.log.error(
      `The user '${request.user.sub}' is not authorized to perform this action.`,
    )
    return HttpProblems.forbidden(request, context);
  } catch (e) {
    context.log.error(
      `Aserto authorization error. The user '${request.user.sub}' is not authorized to perform this action.`,
    )
    return HttpProblems.forbidden(request, context);
  }
}
