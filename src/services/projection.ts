import { ErrorType, ValidationError, resultType } from "./interfaces"

const successResponse = (data: resultType, statusCode: number, code: string, message: string, dataCount?: number, avg?: number) => {
    let obj: any = {
        statusCode: statusCode,
        error: false,
        code: code,
        result: data,
        message: message
    }
    if (dataCount) {
        obj.dataCount = dataCount
    }
    if (avg) {
        obj.avg = avg
    }
    return (obj)
}

const errorAPIResponse = (data: null | {} | [], statusCode: number, code: string, message: string) => {
    return ({
        status: statusCode,
        error: true,
        code: code,
        result: data,
        message: message
    })
}

const errorResponse = (error: unknown) => {
    if (error instanceof ErrorType) {
        return ({
            status: error?.code || 500,
            error: true,
            code: "INTERNAL_SERVER_ERROR",
            errResult: error,
            message: error.message || "Internal Server Error"
        })
    } else {
        return ({
            status: 500,
            error: true,
            code: "INTERNAL_SERVER_ERROR",
            errResult: error,
            message: "Internal Server Error"
        })
    }
}

const validationError = (error: ValidationError[]) => {
    const messageArr = error.map((error: any) => error?.msg || error?.message)
    return ({
        status: 400,
        error: true,
        code: 'VALIDATION_ERROR',
        errResult: error,
        message: messageArr
    })
}

export default {
    successResponse, errorAPIResponse, errorResponse, validationError //API related projection
}

